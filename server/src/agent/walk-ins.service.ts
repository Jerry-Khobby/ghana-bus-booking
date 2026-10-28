import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { generateTicketCode } from '../bookings/ticket-code.js';
import type { StaffUser } from '../common/auth/auth-user.js';
import { AppException } from '../common/errors/app.exception.js';
import { normalizeGhanaPhone } from '../common/phone.js';
import {
  BookingChannel,
  BookingStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  SeatStatus,
  TripStatus,
} from '../generated/prisma/enums.js';
import { MessagesService } from '../messages/messages.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { availableSeatWhere } from '../trips/trip-seats.js';
import { AgentScopeService, notFound } from './agent-scope.service.js';
import { bySeatLabel } from './agent.service.js';
import { SellWalkInDto } from './dto/sell-walk-in.dto.js';

/** A MoMo walk-in keeps its seat this long while the prompt is out. */
const MOMO_HOLD_MS = 5 * 60_000;
const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

/** Selling seats at the bay, and undoing a sale made by mistake. */
@Injectable()
export class WalkInsService {
  private readonly webUrl = (
    process.env.WEB_URL ?? 'http://localhost:5173'
  ).replace(/\/$/, '');

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AgentScopeService,
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    private readonly tickets: TicketsService,
    private readonly messages: MessagesService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * POST /agent/trips/:id/walk-ins. Cash completes the sale at once; MoMo
   * holds the seat and charges the passenger's number like an online payment.
   */
  async sell(user: StaffUser, tripId: string, dto: SellWalkInDto) {
    const trip = await this.scope.trip(user, tripId, {
      id: true,
      status: true,
      operatorId: true,
      farePesewas: true,
      departureAt: true,
      leaveBy: true,
      loadingStartsAt: true,
    });
    if (trip.status !== TripStatus.LOADING) {
      throw new AppException(
        'TRIP_NOT_BOOKABLE',
        'Walk-ins sell only while the bus is loading',
        HttpStatus.CONFLICT,
        { status: trip.status },
      );
    }

    let phone: string | undefined;
    if (dto.phone) {
      phone = normalizeGhanaPhone(dto.phone) ?? undefined;
      if (!phone) {
        throw new AppException(
          'INVALID_PHONE',
          'Enter a Ghana number like 024 000 0000',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const momo =
      dto.method === 'MOMO'
        ? this.payments.checkMomo(dto.momoPhone!, dto.network!)
        : null;
    const email = dto.email?.trim().toLowerCase();
    const now = new Date();

    const sale = await this.prisma.$transaction(async (tx) => {
      await this.bookings.expireStaleHolds(tx, trip.id, now);

      // "The lowest free number is picked for you"
      let seat: { id: string; label: string } | null;
      if (dto.seatLabel) {
        seat = await tx.tripSeat.findUnique({
          where: { tripId_label: { tripId: trip.id, label: dto.seatLabel } },
          select: { id: true, label: true },
        });
        if (!seat) {
          throw new AppException(
            'SEAT_NOT_FOUND',
            `There is no seat ${dto.seatLabel} on this bus`,
            HttpStatus.NOT_FOUND,
          );
        }
      } else {
        const free = await tx.tripSeat.findMany({
          where: { tripId: trip.id, ...availableSeatWhere(now) },
          select: { id: true, label: true },
        });
        seat = free.sort((a, b) => bySeatLabel(a.label, b.label))[0] ?? null;
        if (!seat) {
          throw new AppException(
            'SEAT_TAKEN',
            'There are no free seats left on this bus',
            HttpStatus.CONFLICT,
          );
        }
      }

      // Same race-safe claim as an online hold: the database decides
      const holdExpiresAt = momo
        ? new Date(now.getTime() + MOMO_HOLD_MS)
        : null;
      const { count } = await tx.tripSeat.updateMany({
        where: { id: seat.id, ...availableSeatWhere(now) },
        data: {
          status: momo ? SeatStatus.HELD : SeatStatus.SOLD,
          holdExpiresAt,
        },
      });
      if (!count) {
        throw new AppException(
          'SEAT_TAKEN',
          `Seat ${seat.label} was just taken. Pick another.`,
          HttpStatus.CONFLICT,
        );
      }

      const booking = await tx.booking.create({
        data: {
          code: generateTicketCode(),
          operatorId: trip.operatorId,
          tripId: trip.id,
          tripSeatId: seat.id,
          seatLabel: seat.label,
          contactEmail: email,
          contactPhone: phone ?? momo?.phone,
          passengerName: dto.passengerName?.trim(),
          channel: BookingChannel.WALK_IN,
          soldById: user.sub,
          status: BookingStatus.HELD,
          // Walk-ins pay the fare only; the service fee is for online sales
          farePesewas: trip.farePesewas,
          feePesewas: 0,
          totalPesewas: trip.farePesewas,
          holdExpiresAt,
          qrNonce: randomBytes(16).toString('base64url'),
        },
        select: { id: true, code: true, seatLabel: true, totalPesewas: true },
      });
      await tx.tripSeat.update({
        where: { id: seat.id },
        data: { bookingId: booking.id },
      });

      if (momo) return { booking, messageId: null };

      await tx.payment.create({
        data: {
          bookingId: booking.id,
          method: PaymentMethod.CASH,
          provider: PaymentProvider.CASH,
          providerRef: `cash_${randomBytes(12).toString('hex')}`,
          status: PaymentStatus.SUCCESS,
          amountPesewas: booking.totalPesewas,
          initiatedById: user.sub,
          paidAt: now,
        },
      });
      await tx.cashEntry.create({
        data: {
          bookingId: booking.id,
          agentId: user.sub,
          operatorId: trip.operatorId,
          amountPesewas: booking.totalPesewas,
        },
      });
      await this.bookings.recordSale(
        tx,
        { id: booking.id, tripId: trip.id },
        now,
      );
      const messageId = email
        ? await this.messages.queueTicket(tx, booking.id)
        : null;
      return { booking, messageId };
    }, TX_OPTIONS);
    this.realtime.seatsChanged(trip.id, [sale.booking.seatLabel]);
    this.realtime.tripChanged(trip.id);

    if (momo) {
      const payment = await this.payments.payWalkIn(
        sale.booking.id,
        momo,
        user.sub,
        email,
      );
      return {
        accepted: true as const,
        bookingCode: sale.booking.code,
        seatLabel: sale.booking.seatLabel,
        payment,
      };
    }

    await this.messages.send([sale.messageId]);
    return {
      accepted: false as const,
      booking: {
        code: sale.booking.code,
        seatLabel: sale.booking.seatLabel,
        status: BookingStatus.CONFIRMED,
        totalPesewas: sale.booking.totalPesewas,
        currency: 'GHS' as const,
        passengerName: dto.passengerName?.trim() ?? null,
      },
      // The agent prints this when the passenger gave no email
      ticketUrl: `${this.webUrl}/ticket/${sale.booking.code}?t=${encodeURIComponent(
        this.tickets.linkToken(sale.booking.code, trip),
      )}`,
    };
  }

  /** GET /agent/payments/:id: the walk-in MoMo screen polls this. */
  async payment(user: StaffUser, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        booking: { trip: await this.scope.tripWhere(user) },
      },
      select: { id: true },
    });
    if (!payment) throw notFound('Payment not found');
    return this.payments.getPayment(payment.id);
  }

  /**
   * POST /agent/bookings/:code/void (admins only): a walk-in sold by mistake.
   * Cash sales are cancelled and their unsettled cash entry removed; MoMo
   * sales go to REFUND_PENDING so the tick sends the money back.
   */
  async void(user: StaffUser, code: string, reason: string, ip?: string) {
    const booking = await this.scope.booking(user, code, {
      id: true,
      status: true,
      channel: true,
      tripId: true,
      seatLabel: true,
      trip: { select: { status: true } },
      cashEntry: { select: { settledAt: true } },
      payments: {
        where: { status: PaymentStatus.SUCCESS },
        select: { method: true },
        take: 1,
      },
    });
    if (booking.channel !== BookingChannel.WALK_IN) {
      throw new AppException(
        'INVALID_STATE',
        'Only walk-in sales can be voided here',
        HttpStatus.CONFLICT,
      );
    }
    if (
      booking.trip.status === TripStatus.DEPARTED ||
      booking.trip.status === TripStatus.CANCELLED
    ) {
      throw new AppException(
        'TRIP_LOCKED',
        'This bus has already left',
        HttpStatus.CONFLICT,
      );
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new AppException(
        'INVALID_STATE',
        `A ${booking.status.toLowerCase().replace('_', ' ')} booking can't be voided`,
        HttpStatus.CONFLICT,
        { status: booking.status },
      );
    }
    if (booking.cashEntry?.settledAt) {
      throw new AppException(
        'CASH_SETTLED',
        'This cash has already been collected, so the sale can’t be voided',
        HttpStatus.CONFLICT,
      );
    }

    const paidByMomo = booking.payments[0]?.method === PaymentMethod.MOMO;
    const status = paidByMomo
      ? BookingStatus.REFUND_PENDING
      : BookingStatus.CANCELLED;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: BookingStatus.CONFIRMED },
        data: { status, cancelledAt: now },
      });
      if (!count) {
        throw new AppException(
          'INVALID_STATE',
          'This booking changed while you were looking at it',
          HttpStatus.CONFLICT,
        );
      }
      await tx.tripSeat.updateMany({
        where: { bookingId: booking.id },
        data: {
          status: SeatStatus.AVAILABLE,
          holdExpiresAt: null,
          bookingId: null,
        },
      });
      await tx.trip.update({
        where: { id: booking.tripId },
        data: { seatsSold: { decrement: 1 } },
      });
      // A seat is free again, so a full bus is loading again
      await tx.trip.updateMany({
        where: { id: booking.tripId, status: TripStatus.FULL },
        data: { status: TripStatus.LOADING },
      });
      await tx.cashEntry.deleteMany({
        where: { bookingId: booking.id, settledAt: null },
      });
      await this.audit.record(tx, {
        operatorId: user.op,
        actorType: 'STAFF',
        actorId: user.sub,
        action: 'booking.void',
        entityType: 'Booking',
        entityId: booking.id,
        before: { status: BookingStatus.CONFIRMED },
        after: { status, reason },
        ip,
      });
    }, TX_OPTIONS);
    this.realtime.seatsChanged(booking.tripId, [booking.seatLabel]);
    this.realtime.tripChanged(booking.tripId);

    return { code, status };
  }
}
