import { HttpStatus, Injectable } from '@nestjs/common';
import type { StaffUser } from '../common/auth/auth-user.js';
import { AppException } from '../common/errors/app.exception.js';
import { formatTime, place } from '../common/format.js';
import {
  BookingStatus,
  ScanRejectReason,
  ScanResult,
  TripStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseQrPayload } from '../tickets/ticket-signing.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { AgentScopeService } from './agent-scope.service.js';
import { ScanDto } from './dto/scan.dto.js';

const REASON_TEXT: Record<ScanRejectReason, string> = {
  BAD_SIGNATURE: 'This is not a Seatline ticket',
  NOT_FOUND: 'No ticket with this code',
  WRONG_TRIP: 'This ticket is for another bus',
  NOT_PAID: 'This ticket has not been paid for',
  ALREADY_BOARDED: 'This ticket has already been used',
  TRIP_DEPARTED: 'This ticket was for a bus that has left',
  CANCELLED: 'This ticket was cancelled',
};

/** Scanning tickets at the bay and boarding passengers. */
@Injectable()
export class ScanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AgentScopeService,
    private readonly tickets: TicketsService,
  ) {}

  /**
   * POST /agent/scan. Only checks; boarding is a separate tap. Every scan is
   * logged, good or bad, for no-show and fraud checks. `tripId` is the bus on
   * the agent's console: a ticket for any other bus is WRONG_TRIP.
   */
  async scan(user: StaffUser, dto: ScanDto) {
    const consoleTrip = await this.scope.trip(user, dto.tripId, { id: true });
    const log = async (
      result: ScanResult,
      reason: ScanRejectReason | null,
      bookingId: string | null,
    ) =>
      this.prisma.scanLog.create({
        data: {
          tripId: consoleTrip.id,
          staffId: user.sub,
          bookingId,
          result,
          reason,
        },
      });
    const reject = async (
      reason: ScanRejectReason,
      bookingId: string | null,
      extra: { message?: string; boardedAt?: Date | null } = {},
    ) => {
      await log(ScanResult.REJECTED, reason, bookingId);
      return {
        result: ScanResult.REJECTED,
        reason,
        message: extra.message ?? REASON_TEXT[reason],
        boardedAt: extra.boardedAt ?? null,
      };
    };

    let code: string;
    if (dto.qrPayload) {
      const parsed = parseQrPayload(dto.qrPayload);
      if (!parsed) return reject(ScanRejectReason.BAD_SIGNATURE, null);
      code = parsed.code;
    } else {
      // Typed in by hand from a printed or emailed ticket
      code = dto.code!.trim().toUpperCase();
    }

    const booking = await this.prisma.booking.findFirst({
      where: { code, operatorId: user.op ?? '-' },
      select: {
        id: true,
        code: true,
        tripId: true,
        qrNonce: true,
        status: true,
        seatLabel: true,
        passengerName: true,
        channel: true,
        boardedAt: true,
        trip: {
          select: {
            status: true,
            bay: { select: { number: true } },
            route: {
              select: {
                originStation: { select: { name: true, city: true } },
                destinationStation: { select: { name: true, city: true } },
              },
            },
          },
        },
      },
    });
    if (!booking) return reject(ScanRejectReason.NOT_FOUND, null);
    if (dto.qrPayload && !this.tickets.verifyQr(dto.qrPayload, booking)) {
      return reject(ScanRejectReason.BAD_SIGNATURE, booking.id);
    }

    const ticket = {
      code: booking.code,
      seatLabel: booking.seatLabel,
      passengerName: booking.passengerName,
      channel: booking.channel,
    };
    const rejectTicket = async (
      reason: ScanRejectReason,
      extra?: { message?: string; boardedAt?: Date | null },
    ) => ({ ...(await reject(reason, booking.id, extra)), ticket });

    if (booking.tripId !== consoleTrip.id) {
      const { route, bay } = booking.trip;
      return rejectTicket(ScanRejectReason.WRONG_TRIP, {
        message: `This ticket is for ${place(route.originStation)} → ${place(route.destinationStation)}, bay ${bay.number}`,
      });
    }
    if (
      booking.trip.status === TripStatus.DEPARTED ||
      booking.status === BookingStatus.NO_SHOW
    ) {
      return rejectTicket(ScanRejectReason.TRIP_DEPARTED);
    }

    switch (booking.status) {
      case BookingStatus.CONFIRMED:
        await log(ScanResult.VALID, null, booking.id);
        return {
          result: ScanResult.VALID,
          reason: null,
          message: `Valid ticket · seat ${booking.seatLabel}`,
          boardedAt: null,
          ticket,
        };
      case BookingStatus.BOARDED:
        return rejectTicket(ScanRejectReason.ALREADY_BOARDED, {
          message: `Already used at ${formatTime(booking.boardedAt!)}`,
          boardedAt: booking.boardedAt,
        });
      case BookingStatus.CANCELLED:
      case BookingStatus.REFUND_PENDING:
      case BookingStatus.REFUNDED:
        return rejectTicket(ScanRejectReason.CANCELLED);
      default:
        return rejectTicket(ScanRejectReason.NOT_PAID);
    }
  }

  /**
   * POST /agent/tickets/:code/board. CONFIRMED → BOARDED with one conditional
   * update, so two agents scanning the same ticket can't both board it.
   */
  async board(user: StaffUser, code: string) {
    const booking = await this.scope.booking(user, code.toUpperCase(), {
      id: true,
      tripId: true,
      status: true,
      seatLabel: true,
      passengerName: true,
      trip: { select: { status: true } },
    });
    if (
      booking.trip.status !== TripStatus.LOADING &&
      booking.trip.status !== TripStatus.FULL
    ) {
      throw new AppException(
        booking.trip.status === TripStatus.DEPARTED
          ? 'TRIP_LOCKED'
          : 'INVALID_STATE',
        booking.trip.status === TripStatus.DEPARTED
          ? 'This bus has already left'
          : 'Start loading this bus before boarding passengers',
        HttpStatus.CONFLICT,
      );
    }

    const now = new Date();
    const { count } = await this.prisma.booking.updateMany({
      where: { id: booking.id, status: BookingStatus.CONFIRMED },
      data: {
        status: BookingStatus.BOARDED,
        boardedAt: now,
        boardedById: user.sub,
      },
    });
    if (!count) {
      const current = await this.prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true, boardedAt: true },
      });
      if (current.status === BookingStatus.BOARDED) {
        throw new AppException(
          'ALREADY_BOARDED',
          `Already used at ${formatTime(current.boardedAt!)}`,
          HttpStatus.CONFLICT,
          { boardedAt: current.boardedAt },
        );
      }
      throw new AppException(
        'INVALID_STATE',
        `A ${current.status.toLowerCase().replace('_', ' ')} ticket can't board`,
        HttpStatus.CONFLICT,
        { status: current.status },
      );
    }

    await this.prisma.scanLog.create({
      data: {
        tripId: booking.tripId,
        staffId: user.sub,
        bookingId: booking.id,
        result: ScanResult.BOARDED,
      },
    });
    // TODO(phase 8): publish a console event so the boarded count updates
    return {
      code: code.toUpperCase(),
      seatLabel: booking.seatLabel,
      passengerName: booking.passengerName,
      status: BookingStatus.BOARDED,
      boardedAt: now,
    };
  }
}
