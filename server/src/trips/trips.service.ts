import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BookingStatus,
  DepartureMode,
  SeatStatus,
  TripStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

/** A fixed-time trip still loading this long after departureAt has left. */
export const DEPARTURE_GRACE_MS = 30 * 60 * 1000;

type Db = PrismaService | Prisma.TransactionClient;

/** True when the clock says this trip's stored status is out of date. */
export function isStatusStale(
  trip: {
    status: TripStatus;
    mode: DepartureMode;
    loadingStartsAt: Date | null;
    departureAt: Date | null;
  },
  now: Date,
): boolean {
  if (trip.status === TripStatus.SCHEDULED) {
    return !!trip.loadingStartsAt && trip.loadingStartsAt <= now;
  }
  return (
    (trip.status === TripStatus.LOADING || trip.status === TripStatus.FULL) &&
    trip.mode === DepartureMode.FIXED_TIME &&
    !!trip.departureAt &&
    trip.departureAt.getTime() + DEPARTURE_GRACE_MS <= now.getTime()
  );
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Moves a trip along its lifecycle based on the clock. Runs lazily on every
   * trip read instead of on a timer, so the free database can sleep. Every
   * change is a conditional update on the current status, so running it twice,
   * or from two requests at once, does no harm.
   */
  async refreshStatus(tripId: string, now = new Date()): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        status: true,
        mode: true,
        bayId: true,
        loadingStartsAt: true,
        departureAt: true,
      },
    });
    if (!trip) return;
    let { status } = trip;

    // SCHEDULED → LOADING, unless another bus is loading at the same bay
    if (
      status === TripStatus.SCHEDULED &&
      trip.loadingStartsAt &&
      trip.loadingStartsAt <= now
    ) {
      const bayBusy = await this.prisma.trip.count({
        where: {
          bayId: trip.bayId,
          id: { not: tripId },
          status: { in: [TripStatus.LOADING, TripStatus.FULL] },
        },
      });
      if (!bayBusy) {
        const { count } = await this.prisma.trip.updateMany({
          where: { id: tripId, status: TripStatus.SCHEDULED },
          data: { status: TripStatus.LOADING },
        });
        if (count) {
          status = TripStatus.LOADING;
          this.realtime.tripChanged(tripId);
        }
      }
    }

    // LOADING or FULL → DEPARTED, 30 minutes after a fixed departure time
    const departed =
      trip.mode === DepartureMode.FIXED_TIME &&
      trip.departureAt &&
      trip.departureAt.getTime() + DEPARTURE_GRACE_MS <= now.getTime();
    if (
      departed &&
      (status === TripStatus.LOADING || status === TripStatus.FULL)
    ) {
      const left = await this.prisma.$transaction((tx) =>
        this.depart(tx, tripId, trip.departureAt!),
      );
      if (left) this.realtime.tripChanged(tripId);
    }
  }

  /**
   * Marks a trip DEPARTED: open holds expire and confirmed passengers who never
   * boarded become NO_SHOW (their seats stay sold). Returns false if the trip
   * had already left or isn't loading. The agent's "Depart" button reuses this.
   */
  async depart(db: Db, tripId: string, departedAt: Date): Promise<boolean> {
    const { count } = await db.trip.updateMany({
      where: {
        id: tripId,
        status: { in: [TripStatus.LOADING, TripStatus.FULL] },
      },
      data: { status: TripStatus.DEPARTED, departedAt },
    });
    if (!count) return false;

    const open = { in: [BookingStatus.HELD, BookingStatus.PENDING_PAYMENT] };
    await db.tripSeat.updateMany({
      where: { tripId, status: SeatStatus.HELD },
      data: {
        status: SeatStatus.AVAILABLE,
        bookingId: null,
        holdExpiresAt: null,
      },
    });
    await db.booking.updateMany({
      where: { tripId, status: open },
      data: { status: BookingStatus.EXPIRED },
    });
    await db.booking.updateMany({
      where: { tripId, status: BookingStatus.CONFIRMED },
      data: { status: BookingStatus.NO_SHOW },
    });
    return true;
  }
}
