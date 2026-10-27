import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BookingChannel,
  BookingStatus,
  DepartureMode,
  OperatorStatus,
  SeatStatus,
  TripStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { availableSeatWhere } from '../trips/trip-seats.js';
import { TripsService } from '../trips/trips.service.js';
import { CreateHoldDto } from './dto/create-hold.dto.js';
import { createHoldToken, hashHoldToken } from './hold-token.js';
import { generateTicketCode } from './ticket-code.js';

type Db = PrismaService | Prisma.TransactionClient;

/** Bookings that still have a claim on their seat. */
const OPEN_STATUSES = [BookingStatus.HELD, BookingStatus.PENDING_PAYMENT];

// Fifty people tapping one seat queue on its row lock; give them time to
// get a connection and finish rather than failing with a timeout.
const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
  ) {}

  /**
   * Frees seats on one trip whose hold ran out and marks their bookings
   * EXPIRED. Runs before every write that touches a trip's seats, and on seat
   * reads, so nothing depends on a timer.
   */
  async expireStaleHolds(db: Db, tripId: string, now = new Date()) {
    const stale = await db.tripSeat.findMany({
      where: { tripId, status: SeatStatus.HELD, holdExpiresAt: { lt: now } },
      select: { id: true, bookingId: true },
    });
    if (!stale.length) return 0;

    // Re-check the expiry in the update: someone may have taken the seat since
    const { count } = await db.tripSeat.updateMany({
      where: {
        id: { in: stale.map((s) => s.id) },
        status: SeatStatus.HELD,
        holdExpiresAt: { lt: now },
      },
      data: {
        status: SeatStatus.AVAILABLE,
        holdExpiresAt: null,
        bookingId: null,
      },
    });
    await db.booking.updateMany({
      where: {
        id: { in: stale.flatMap((s) => (s.bookingId ? [s.bookingId] : [])) },
        status: { in: OPEN_STATUSES },
      },
      data: { status: BookingStatus.EXPIRED },
    });
    // TODO(phase 8): publish a seat event for each freed seat
    return count;
  }

  /**
   * POST /holds: takes one seat for holdMinutes. The database decides who wins
   * a race: one conditional update on the seat row, inside a transaction.
   * `previousToken` is the caller's hold token, if they have one, so taking a
   * new seat on the same trip releases their old one; a signed-in passenger's
   * old hold on the trip is released the same way.
   */
  async createHold(
    dto: CreateHoldDto,
    previousToken?: string,
    passengerId?: string,
  ) {
    const now = new Date();
    await this.trips.refreshStatus(dto.tripId, now);

    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, status: { not: TripStatus.CANCELLED } },
      select: {
        id: true,
        status: true,
        onlineBookingOpen: true,
        mode: true,
        departureAt: true,
        farePesewas: true,
        operatorId: true,
        operator: {
          select: { status: true, holdMinutes: true, serviceFeePesewas: true },
        },
      },
    });
    if (!trip) {
      throw new AppException(
        'NOT_FOUND',
        'Trip not found',
        HttpStatus.NOT_FOUND,
      );
    }
    // A stored status can lag (a trip waiting for a busy bay never loads), so
    // a fixed departure time that has passed also closes online sales
    const leftAlready =
      trip.mode === DepartureMode.FIXED_TIME &&
      !!trip.departureAt &&
      trip.departureAt <= now;
    const bookable =
      (trip.status === TripStatus.SCHEDULED ||
        trip.status === TripStatus.LOADING) &&
      !leftAlready &&
      trip.onlineBookingOpen &&
      trip.operator.status === OperatorStatus.ACTIVE;
    if (!bookable) {
      throw new AppException(
        'TRIP_NOT_BOOKABLE',
        'This trip can no longer be booked online',
        HttpStatus.CONFLICT,
        { status: trip.status },
      );
    }

    const { token, hash } = createHoldToken();
    const expiresAt = new Date(
      now.getTime() + trip.operator.holdMinutes * 60_000,
    );
    const farePesewas = trip.farePesewas;
    const feePesewas = trip.operator.serviceFeePesewas;

    const booking = await this.prisma.$transaction(async (tx) => {
      await this.expireStaleHolds(tx, trip.id, now);

      // One hold per person per trip: let go of the old seat first
      if (passengerId) {
        await this.cancelHeld(tx, { tripId: trip.id, passengerId }, now);
      }
      if (previousToken) {
        await this.cancelHeld(
          tx,
          {
            tripId: trip.id,
            holdTokenHash: hashHoldToken(previousToken),
          },
          now,
        );
      }

      const seat = await tx.tripSeat.findUnique({
        where: { tripId_label: { tripId: trip.id, label: dto.seatLabel } },
        select: { id: true },
      });
      if (!seat) {
        throw new AppException(
          'SEAT_NOT_FOUND',
          `There is no seat ${dto.seatLabel} on this bus`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Claim the seat first. Postgres locks the row: a second request waits
      // here, re-checks the where clause once the first commits, and updates
      // nothing. bookingId is left alone in this update on purpose: it has a
      // unique index, so setting it takes a stronger lock that deadlocks with
      // the foreign-key lock every competing booking insert takes on the seat.
      const { count } = await tx.tripSeat.updateMany({
        where: { id: seat.id, ...availableSeatWhere(now) },
        data: { status: SeatStatus.HELD, holdExpiresAt: expiresAt },
      });
      if (!count) {
        throw new AppException(
          'SEAT_TAKEN',
          `Seat ${dto.seatLabel} was just taken. Pick another.`,
          HttpStatus.CONFLICT,
        );
      }

      const booking = await tx.booking.create({
        data: {
          code: generateTicketCode(),
          operatorId: trip.operatorId,
          tripId: trip.id,
          tripSeatId: seat.id,
          seatLabel: dto.seatLabel,
          channel: BookingChannel.ONLINE,
          status: BookingStatus.HELD,
          farePesewas,
          feePesewas,
          totalPesewas: farePesewas + feePesewas,
          holdExpiresAt: expiresAt,
          holdTokenHash: hash,
          passengerId,
          qrNonce: randomBytes(16).toString('base64url'),
        },
        select: { id: true },
      });
      // We already hold the row lock, so nobody else can be waiting to link
      await tx.tripSeat.update({
        where: { id: seat.id },
        data: { bookingId: booking.id },
      });

      // If we took a seat whose hold had just run out, its old booking expires
      await tx.booking.updateMany({
        where: {
          tripSeatId: seat.id,
          id: { not: booking.id },
          status: { in: OPEN_STATUSES },
        },
        data: { status: BookingStatus.EXPIRED },
      });
      // TODO(phase 8): publish a seat event (HELD)
      return booking;
    }, TX_OPTIONS);

    return {
      holdId: booking.id,
      holdToken: token,
      tripId: trip.id,
      seatLabel: dto.seatLabel,
      expiresAt,
      farePesewas,
      feePesewas,
      totalPesewas: farePesewas + feePesewas,
      currency: 'GHS' as const,
    };
  }

  /** GET /holds/:id: the Payment screen's summary and "held for 03:42" timer. */
  async getHold(id: string) {
    const now = new Date();
    const { tripId } = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
      select: { tripId: true },
    });
    await this.expireStaleHolds(this.prisma, tripId, now);

    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        status: true,
        seatLabel: true,
        farePesewas: true,
        feePesewas: true,
        totalPesewas: true,
        holdExpiresAt: true,
        trip: {
          select: {
            id: true,
            mode: true,
            departureAt: true,
            loadingStartsAt: true,
            operator: { select: { name: true } },
            bus: { select: { plate: true } },
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

    const open = (OPEN_STATUSES as BookingStatus[]).includes(booking.status);
    const secondsLeft =
      open && booking.holdExpiresAt
        ? Math.max(
            0,
            Math.ceil((booking.holdExpiresAt.getTime() - now.getTime()) / 1000),
          )
        : 0;
    const { route, ...trip } = booking.trip;

    return {
      holdId: booking.id,
      status: booking.status,
      seatLabel: booking.seatLabel,
      trip: {
        ...trip,
        origin: route.originStation,
        destination: route.destinationStation,
      },
      farePesewas: booking.farePesewas,
      feePesewas: booking.feePesewas,
      totalPesewas: booking.totalPesewas,
      currency: 'GHS' as const,
      expiresAt: booking.holdExpiresAt,
      secondsLeft,
    };
  }

  /** DELETE /holds/:id: "Cancel and release my seat". Only while HELD. */
  async releaseHold(id: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { tripId } = await tx.booking.findUniqueOrThrow({
        where: { id },
        select: { tripId: true },
      });
      await this.expireStaleHolds(tx, tripId, now);

      if (await this.cancelHeld(tx, { id }, now)) return;

      const { status } = await tx.booking.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (status === BookingStatus.PENDING_PAYMENT) {
        throw new AppException(
          'PAYMENT_IN_PROGRESS',
          'A payment is in progress for this seat. Wait for it to finish.',
          HttpStatus.CONFLICT,
        );
      }
      if (status === BookingStatus.EXPIRED) {
        throw new AppException(
          'HOLD_EXPIRED',
          'Your hold ran out and the seat was released',
          HttpStatus.CONFLICT,
        );
      }
      throw new AppException(
        'INVALID_STATE',
        `A ${status.toLowerCase()} booking can't be released`,
        HttpStatus.CONFLICT,
        { status },
      );
    }, TX_OPTIONS);
    // TODO(phase 8): publish a seat event (AVAILABLE)
  }

  /** Cancels a HELD booking and frees its seat. False if none matched. */
  private async cancelHeld(
    tx: Prisma.TransactionClient,
    where: Prisma.BookingWhereInput,
    now: Date,
  ) {
    const held = await tx.booking.findFirst({
      where: { ...where, status: BookingStatus.HELD },
      select: { id: true },
    });
    if (!held) return false;

    const { count } = await tx.booking.updateMany({
      where: { id: held.id, status: BookingStatus.HELD },
      data: { status: BookingStatus.CANCELLED, cancelledAt: now },
    });
    if (!count) return false;
    await tx.tripSeat.updateMany({
      where: { bookingId: held.id },
      data: {
        status: SeatStatus.AVAILABLE,
        holdExpiresAt: null,
        bookingId: null,
      },
    });
    return true;
  }
}
