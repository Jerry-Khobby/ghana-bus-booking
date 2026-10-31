import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BookingChannel,
  BookingStatus,
  OperatorStatus,
  SeatStatus,
  TripStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { availableSeatWhere } from '../trips/trip-seats.js';
import { leavesAt, TripsService } from '../trips/trips.service.js';
import { CreateHoldDto } from './dto/create-hold.dto.js';
import { createHoldToken, hashHoldToken } from './hold-token.js';
import { generateTicketCode } from './ticket-code.js';

type Db = PrismaService | Prisma.TransactionClient;

/** Bookings that still have a claim on their seat. */
const OPEN_STATUSES = [BookingStatus.HELD, BookingStatus.PENDING_PAYMENT];

/**
 * Every booking in a hold: the first one, whose id is the hold id, and the
 * seats taken with it. A single seat or a walk-in is a hold of one.
 */
export const inHold = (holdId: string): Prisma.BookingWhereInput => ({
  OR: [{ id: holdId }, { groupId: holdId }],
});

/** "Seat 14" / "Seats 14 and 15" / "Seats 3, 4 and 5" */
function seatsPhrase(labels: string[]) {
  if (labels.length === 1) return `Seat ${labels[0]}`;
  return `Seats ${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

// Fifty people tapping one seat queue on its row lock; give them time to
// get a connection and finish rather than failing with a timeout.
const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Frees seats on one trip whose hold ran out and marks their bookings
   * EXPIRED. Runs before every write that touches a trip's seats, and on seat
   * reads, so nothing depends on a timer.
   */
  async expireStaleHolds(db: Db, tripId: string, now = new Date()) {
    const stale = await db.tripSeat.findMany({
      where: { tripId, status: SeatStatus.HELD, holdExpiresAt: { lt: now } },
      select: { id: true, bookingId: true, label: true },
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
    // Safe to announce before the caller commits: an expired hold reads as
    // AVAILABLE whether or not this write lands
    this.realtime.seatsChanged(
      tripId,
      stale.map((s) => s.label),
    );
    if (count) this.realtime.tripChanged(tripId);
    return count;
  }

  /**
   * POST /holds: takes one seat, or up to six together, for holdMinutes. The
   * database decides who wins a race: one conditional update per seat row,
   * inside a transaction, so either every seat is held or none is.
   * `previousToken` is the caller's hold token, if they have one, so a new
   * hold on the same trip releases their old one; a signed-in passenger's old
   * hold on the trip is released the same way.
   */
  async createHold(
    dto: CreateHoldDto,
    previousToken?: string,
    passengerId?: string,
  ) {
    if (dto.seatLabel !== undefined && dto.seatLabels !== undefined) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Send seatLabel or seatLabels, not both',
        HttpStatus.BAD_REQUEST,
      );
    }
    const labels = dto.seatLabels ?? [dto.seatLabel!];
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
        leaveBy: true,
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
    // a departure time or leave-by deadline that has passed also closes sales
    const leaves = leavesAt(trip);
    const leftAlready = !!leaves && leaves <= now;
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

    // Seats this request let go of, announced once it commits
    const released: string[] = [];
    const holdId = await this.prisma.$transaction(async (tx) => {
      released.length = 0;
      await this.expireStaleHolds(tx, trip.id, now);

      // One hold per person per trip: let go of the old seats first
      if (passengerId) {
        released.push(
          ...(await this.cancelHeld(tx, { tripId: trip.id, passengerId }, now)),
        );
      }
      if (previousToken) {
        released.push(
          ...(await this.cancelHeld(
            tx,
            {
              tripId: trip.id,
              holdTokenHash: hashHoldToken(previousToken),
            },
            now,
          )),
        );
      }

      const seats = await tx.tripSeat.findMany({
        where: { tripId: trip.id, label: { in: labels } },
        // Always lock seat rows in the same order, so two holds that share
        // seats queue behind each other instead of deadlocking
        orderBy: { id: 'asc' },
        select: { id: true, label: true },
      });
      const missing = labels.filter((l) => !seats.some((s) => s.label === l));
      if (missing.length) {
        throw new AppException(
          'SEAT_NOT_FOUND',
          `There is no ${seatsPhrase(missing).toLowerCase()} on this bus`,
          HttpStatus.NOT_FOUND,
          { seats: missing },
        );
      }

      // Claim the seats first. Postgres locks each row: a second request waits
      // here, re-checks the where clause once the first commits, and updates
      // nothing. bookingId is left alone in this update on purpose: it has a
      // unique index, so setting it takes a stronger lock that deadlocks with
      // the foreign-key lock every competing booking insert takes on the seat.
      const taken: string[] = [];
      for (const seat of seats) {
        const { count } = await tx.tripSeat.updateMany({
          where: { id: seat.id, ...availableSeatWhere(now) },
          data: { status: SeatStatus.HELD, holdExpiresAt: expiresAt },
        });
        if (!count) taken.push(seat.label);
      }
      if (taken.length) {
        // Throwing rolls back the seats this request did get
        const ordered = labels.filter((l) => taken.includes(l));
        throw new AppException(
          'SEAT_TAKEN',
          ordered.length === 1
            ? `Seat ${ordered[0]} was just taken. Pick another.`
            : `${seatsPhrase(ordered)} were just taken. Pick others.`,
          HttpStatus.CONFLICT,
          { seats: ordered },
        );
      }

      // One booking per seat, in the order they were picked; the first one's
      // id is the hold id
      let firstId: string | undefined;
      for (const label of labels) {
        const seat = seats.find((s) => s.label === label)!;
        const booking = await tx.booking.create({
          data: {
            code: generateTicketCode(),
            operatorId: trip.operatorId,
            tripId: trip.id,
            tripSeatId: seat.id,
            seatLabel: label,
            groupId: firstId,
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
        firstId ??= booking.id;
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
      }
      return firstId!;
    }, TX_OPTIONS);
    this.realtime.seatsChanged(trip.id, [...labels, ...released]);
    this.realtime.tripChanged(trip.id);

    return {
      holdId,
      holdToken: token,
      tripId: trip.id,
      seatLabel: labels[0],
      seatLabels: labels,
      expiresAt,
      // Per seat; totalPesewas is the whole hold
      farePesewas,
      feePesewas,
      totalPesewas: (farePesewas + feePesewas) * labels.length,
      currency: 'GHS' as const,
    };
  }

  /** The hold a booking belongs to: its first booking's id. */
  async holdIdOf(db: Db, bookingId: string) {
    const { id, groupId } = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { id: true, groupId: true },
    });
    return groupId ?? id;
  }

  /** GET /holds/:id: the Payment screen's summary and "held for 03:42" timer. */
  async getHold(bookingId: string) {
    const now = new Date();
    const id = await this.holdIdOf(this.prisma, bookingId);
    const { tripId } = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
      select: { tripId: true },
    });
    await this.expireStaleHolds(this.prisma, tripId, now);

    const seats = await this.prisma.booking.findMany({
      where: inHold(id),
      orderBy: { id: 'asc' },
      select: { seatLabel: true, totalPesewas: true },
    });
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
        // The latest attempt, so a screen that lost the pay reply can pick it up
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true },
        },
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
      seatLabels: seats.map((s) => s.seatLabel),
      trip: {
        ...trip,
        origin: route.originStation,
        destination: route.destinationStation,
      },
      // Per seat; totalPesewas is the whole hold
      farePesewas: booking.farePesewas,
      feePesewas: booking.feePesewas,
      totalPesewas: seats.reduce((sum, s) => sum + s.totalPesewas, 0),
      currency: 'GHS' as const,
      expiresAt: booking.holdExpiresAt,
      secondsLeft,
      payment: booking.payments[0] ?? null,
    };
  }

  /** DELETE /holds/:id: "Cancel and release my seats". Only while HELD. */
  async releaseHold(bookingId: string) {
    const now = new Date();
    const freed = await this.prisma.$transaction(async (tx) => {
      const id = await this.holdIdOf(tx, bookingId);
      const { tripId } = await tx.booking.findUniqueOrThrow({
        where: { id },
        select: { tripId: true },
      });
      await this.expireStaleHolds(tx, tripId, now);

      const labels = await this.cancelHeld(tx, inHold(id), now);
      if (labels.length) return { tripId, labels };

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
    this.realtime.seatsChanged(freed.tripId, freed.labels);
    this.realtime.tripChanged(freed.tripId);
  }

  /**
   * A sold seat: the booking is CONFIRMED and the trip's sold count goes up;
   * the last seat makes the trip FULL. The caller has already marked the seat
   * SOLD. Online payments and walk-in sales both end here.
   */
  async recordSale(
    tx: Prisma.TransactionClient,
    booking: { id: string; tripId: string },
    now: Date,
  ) {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CONFIRMED,
        confirmedAt: now,
        holdExpiresAt: null,
      },
    });
    const trip = await tx.trip.update({
      where: { id: booking.tripId },
      data: { seatsSold: { increment: 1 } },
      select: { seatsSold: true, seatsTotal: true },
    });
    if (trip.seatsSold >= trip.seatsTotal) {
      await tx.trip.updateMany({
        where: {
          id: booking.tripId,
          status: { in: [TripStatus.SCHEDULED, TripStatus.LOADING] },
        },
        data: { status: TripStatus.FULL },
      });
    }
  }

  /** Cancels the HELD bookings that match and frees their seats. Returns their labels. */
  private async cancelHeld(
    tx: Prisma.TransactionClient,
    where: Prisma.BookingWhereInput,
    now: Date,
  ) {
    const held = await tx.booking.findMany({
      where: { AND: [where, { status: BookingStatus.HELD }] },
      select: { id: true, seatLabel: true },
    });
    const freed: string[] = [];
    for (const booking of held) {
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: BookingStatus.HELD },
        data: { status: BookingStatus.CANCELLED, cancelledAt: now },
      });
      if (!count) continue;
      await tx.tripSeat.updateMany({
        where: { bookingId: booking.id },
        data: {
          status: SeatStatus.AVAILABLE,
          holdExpiresAt: null,
          bookingId: null,
        },
      });
      freed.push(booking.seatLabel);
    }
    return freed;
  }
}
