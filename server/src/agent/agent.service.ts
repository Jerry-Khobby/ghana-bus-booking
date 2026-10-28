import { HttpStatus, Injectable } from '@nestjs/common';
import type { StaffUser } from '../common/auth/auth-user.js';
import { AppException } from '../common/errors/app.exception.js';
import { formatTime } from '../common/format.js';
import { maskPhone } from '../common/phone.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BookingChannel,
  BookingStatus,
  DepartureMode,
  PaymentMethod,
  PaymentStatus,
  SeatStatus,
  TripStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  pings,
  RealtimeService,
  type ConsoleSignal,
} from '../realtime/realtime.service.js';
import {
  catchError,
  concat,
  concatMap,
  debounceTime,
  EMPTY,
  finalize,
  from,
  map,
  merge,
  of,
  ReplaySubject,
} from 'rxjs';
import { effectiveSeatStatus } from '../trips/trip-seats.js';
import { isStatusStale, TripsService } from '../trips/trips.service.js';
import { AgentScopeService, notFound } from './agent-scope.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SOLD_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.BOARDED,
  BookingStatus.NO_SHOW,
];

/** "2" before "10": seat labels are numbers on every layout we draw. */
export const bySeatLabel = (a: string, b: string) =>
  Number(a) - Number(b) || a.localeCompare(b);

const consoleTripSelect = {
  id: true,
  status: true,
  mode: true,
  departureAt: true,
  loadingStartsAt: true,
  leaveBy: true,
  farePesewas: true,
  seatsTotal: true,
  bus: { select: { plate: true, type: true } },
  route: {
    select: {
      originStation: { select: { name: true, city: true } },
      destinationStation: { select: { name: true, city: true } },
    },
  },
  seats: {
    select: {
      label: true,
      row: true,
      col: true,
      status: true,
      holdExpiresAt: true,
      booking: { select: { status: true, channel: true } },
    },
  },
} satisfies Prisma.TripSelect;

const nextTripSelect = {
  id: true,
  status: true,
  mode: true,
  departureAt: true,
  loadingStartsAt: true,
} satisfies Prisma.TripSelect;

const QUEUE_LENGTH = 3;

const queueTripSelect = {
  ...nextTripSelect,
  seatsTotal: true,
  bus: { select: { plate: true } },
  route: {
    select: { destinationStation: { select: { name: true, city: true } } },
  },
} satisfies Prisma.TripSelect;

/** The loading console: what's at the bay, who's on it, and moving it on. */
@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AgentScopeService,
    private readonly trips: TripsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** GET /agent/console?bayId= */
  async console(user: StaffUser, bayId?: string) {
    const bays = await this.scope.bays(user);
    if (!bays.length) throw notFound('No bays are assigned to you');
    const bay = bayId ? bays.find((b) => b.id === bayId) : bays[0];
    if (!bay) throw notFound('Bay not found');

    const now = new Date();
    await this.refreshBay(bay.id, now);

    const current =
      (await this.prisma.trip.findFirst({
        where: {
          bayId: bay.id,
          status: { in: [TripStatus.LOADING, TripStatus.FULL] },
        },
        orderBy: { loadingStartsAt: 'asc' },
        select: consoleTripSelect,
      })) ??
      (await this.prisma.trip.findFirst({
        where: { bayId: bay.id, ...scheduledToday(now) },
        orderBy: nextOrder,
        select: consoleTripSelect,
      }));

    const bayView = { id: bay.id, number: bay.number, station: bay.station };
    const otherBays = bays.map((b) => ({ id: b.id, number: b.number }));
    if (!current) {
      return {
        bay: bayView,
        bays: otherBays,
        trip: null,
        counts: null,
        seats: [],
        nextTrip: null,
        queue: [],
      };
    }

    const seats = current.seats
      .map((seat) => ({
        label: seat.label,
        r: seat.row,
        c: seat.col,
        status: effectiveSeatStatus(seat, now),
        boarded: seat.booking?.status === BookingStatus.BOARDED,
        channel: seat.status === SeatStatus.SOLD ? seat.booking?.channel : null,
      }))
      .sort((a, b) => bySeatLabel(a.label, b.label));
    const sold = seats.filter((s) => s.status === SeatStatus.SOLD);
    const held = seats.filter((s) => s.status === SeatStatus.HELD).length;
    const blocked = seats.filter((s) => s.status === SeatStatus.BLOCKED).length;

    const queue = await this.bayQueue(bay.id, current.id, now);

    return {
      bay: bayView,
      bays: otherBays,
      trip: {
        id: current.id,
        status: current.status,
        mode: current.mode,
        route: {
          origin: current.route.originStation,
          destination: current.route.destinationStation,
        },
        bus: current.bus,
        departureAt: current.departureAt,
        loadingStartsAt: current.loadingStartsAt,
        leaveBy: current.leaveBy,
        farePesewas: current.farePesewas,
        currency: 'GHS' as const,
        banner: banner(current),
        departDue: departDue(current, now),
      },
      counts: {
        total: current.seatsTotal,
        sold: sold.length,
        online: sold.filter((s) => s.channel === BookingChannel.ONLINE).length,
        walkIn: sold.filter((s) => s.channel === BookingChannel.WALK_IN).length,
        boarded: seats.filter((s) => s.boarded).length,
        held,
        free: current.seatsTotal - sold.length - held - blocked,
      },
      seats: seats.map(({ channel: _channel, ...seat }) => seat),
      nextTrip: queue[0] ?? null,
      queue,
    };
  }

  /**
   * The next few buses booked onto the bay today, with what has sold on each,
   * for the console's "Next at this bay" list.
   */
  private async bayQueue(bayId: string, currentId: string, now: Date) {
    const trips = await this.prisma.trip.findMany({
      where: { bayId, id: { not: currentId }, ...scheduledToday(now) },
      orderBy: nextOrder,
      take: QUEUE_LENGTH,
      select: queueTripSelect,
    });
    const sold = await this.prisma.booking.groupBy({
      by: ['tripId', 'channel'],
      where: {
        tripId: { in: trips.map((t) => t.id) },
        status: { in: SOLD_STATUSES },
      },
      _count: { _all: true },
    });
    const count = (tripId: string, channel: BookingChannel) =>
      sold.find((g) => g.tripId === tripId && g.channel === channel)?._count
        ._all ?? 0;

    return trips.map(({ bus, route, seatsTotal, ...trip }) => {
      const online = count(trip.id, BookingChannel.ONLINE);
      const walkIn = count(trip.id, BookingChannel.WALK_IN);
      return {
        ...trip,
        plate: bus.plate,
        destination: route.destinationStation,
        counts: { total: seatsTotal, sold: online + walkIn, online, walkIn },
      };
    });
  }

  /**
   * GET /agent/console/stream?bayId=: the console now, then a fresh one after
   * every change at the bay. Bursts (a run of sales) are folded into one
   * redraw.
   */
  async consoleStream(user: StaffUser, bayId?: string) {
    const bays = await this.scope.bays(user);
    const bay = bayId ? bays.find((b) => b.id === bayId) : bays[0];
    if (!bay)
      throw notFound(
        bays.length ? 'Bay not found' : 'No bays are assigned to you',
      );

    const signals = new ReplaySubject<ConsoleSignal>(1);
    const listening = this.realtime.consoleSignals(bay.id).subscribe(signals);
    const first = await this.console(user, bay.id);
    const updates = signals.pipe(
      debounceTime(250),
      concatMap(() => from(this.console(user, bay.id))),
      // The agent lost this bay: stop updating rather than fail the stream
      catchError(() => EMPTY),
    );
    return merge(
      concat(of(first), updates).pipe(
        map((data) => ({ type: 'console', data })),
      ),
      pings(),
    ).pipe(finalize(() => listening.unsubscribe()));
  }

  /** GET /agent/trips/:id/manifest: who should be on the bus, by seat. */
  async manifest(user: StaffUser, tripId: string) {
    await this.scope.trip(user, tripId, { id: true });
    const bookings = await this.prisma.booking.findMany({
      where: { tripId, status: { in: SOLD_STATUSES } },
      select: {
        seatLabel: true,
        code: true,
        passengerName: true,
        contactPhone: true,
        channel: true,
        status: true,
        boardedAt: true,
      },
    });
    return bookings
      .sort((a, b) => bySeatLabel(a.seatLabel, b.seatLabel))
      .map(({ contactPhone, ...booking }) => ({
        ...booking,
        phoneMasked: contactPhone ? maskPhone(contactPhone) : null,
      }));
  }

  /** POST /agent/trips/:id/start-loading: SCHEDULED → LOADING, one per bay. */
  async startLoading(user: StaffUser, tripId: string) {
    const trip = await this.scope.trip(user, tripId, {
      id: true,
      status: true,
      bayId: true,
    });
    if (trip.status !== TripStatus.SCHEDULED) {
      throw new AppException(
        'INVALID_STATE',
        `This trip is already ${trip.status.toLowerCase()}`,
        HttpStatus.CONFLICT,
        { status: trip.status },
      );
    }
    const busy = await this.prisma.trip.findFirst({
      where: {
        bayId: trip.bayId,
        id: { not: trip.id },
        status: { in: [TripStatus.LOADING, TripStatus.FULL] },
      },
      select: { bus: { select: { plate: true } } },
    });
    if (busy) {
      throw new AppException(
        'BAY_BUSY',
        `Bus ${busy.bus.plate} is still loading at this bay`,
        HttpStatus.CONFLICT,
      );
    }
    const { count } = await this.prisma.trip.updateMany({
      where: { id: trip.id, status: TripStatus.SCHEDULED },
      data: { status: TripStatus.LOADING },
    });
    if (!count) {
      throw new AppException(
        'INVALID_STATE',
        'This trip changed while you were looking at it',
        HttpStatus.CONFLICT,
      );
    }
    this.realtime.tripChanged(trip.id);
    return { id: trip.id, status: TripStatus.LOADING };
  }

  /**
   * POST /agent/trips/:id/depart. Asks first if confirmed passengers haven't
   * boarded; then marks them NO_SHOW, releases open holds, and starts loading
   * the bay's next bus if its time has come.
   */
  async depart(user: StaffUser, tripId: string, confirmUnboarded: boolean) {
    const trip = await this.scope.trip(user, tripId, {
      id: true,
      status: true,
      bayId: true,
    });
    if (trip.status !== TripStatus.LOADING && trip.status !== TripStatus.FULL) {
      throw new AppException(
        'INVALID_STATE',
        `A ${trip.status.toLowerCase()} trip can't depart`,
        HttpStatus.CONFLICT,
        { status: trip.status },
      );
    }

    const unboarded = await this.prisma.booking.count({
      where: { tripId, status: BookingStatus.CONFIRMED },
    });
    if (unboarded && !confirmUnboarded) {
      throw new AppException(
        'UNBOARDED_PASSENGERS',
        `${unboarded} passenger${unboarded === 1 ? ' has' : 's have'} not boarded. Depart anyway?`,
        HttpStatus.CONFLICT,
        { count: unboarded },
      );
    }

    const now = new Date();
    const departed = await this.prisma.$transaction((tx) =>
      this.trips.depart(tx, tripId, now),
    );
    if (!departed) {
      throw new AppException(
        'INVALID_STATE',
        'This trip has already departed',
        HttpStatus.CONFLICT,
      );
    }
    this.realtime.tripChanged(tripId);

    // The bay is free: the next bus starts loading if its time has come
    let nextTrip = await this.prisma.trip.findFirst({
      where: { bayId: trip.bayId, ...scheduledToday(now) },
      orderBy: nextOrder,
      select: nextTripSelect,
    });
    if (nextTrip && isStatusStale(nextTrip, now)) {
      await this.trips.refreshStatus(nextTrip.id, now);
      nextTrip = await this.prisma.trip.findUniqueOrThrow({
        where: { id: nextTrip.id },
        select: nextTripSelect,
      });
    }

    return {
      trip: { id: tripId, status: TripStatus.DEPARTED, departedAt: now },
      noShows: unboarded,
      nextTrip,
    };
  }

  /** GET /agent/sales?date=: the calling agent's walk-ins for one day. */
  async sales(user: StaffUser, date?: string) {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00Z`);
    const bookings = await this.prisma.booking.findMany({
      where: {
        soldById: user.sub,
        channel: BookingChannel.WALK_IN,
        status: { in: SOLD_STATUSES },
        confirmedAt: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
      },
      orderBy: { confirmedAt: 'asc' },
      select: {
        code: true,
        seatLabel: true,
        passengerName: true,
        totalPesewas: true,
        confirmedAt: true,
        payments: {
          where: { status: PaymentStatus.SUCCESS },
          select: { method: true },
          take: 1,
        },
        trip: {
          select: {
            route: {
              select: {
                originStation: { select: { city: true } },
                destinationStation: { select: { city: true } },
              },
            },
          },
        },
      },
    });

    const items = bookings.map((b) => ({
      code: b.code,
      seatLabel: b.seatLabel,
      passengerName: b.passengerName,
      method: b.payments[0]?.method ?? PaymentMethod.CASH,
      amountPesewas: b.totalPesewas,
      confirmedAt: b.confirmedAt,
      route: `${b.trip.route.originStation.city} → ${b.trip.route.destinationStation.city}`,
    }));
    const total = (method: PaymentMethod) =>
      items
        .filter((i) => i.method === method)
        .reduce((sum, i) => sum + i.amountPesewas, 0);

    return {
      date: day,
      count: items.length,
      cashPesewas: total(PaymentMethod.CASH),
      momoPesewas: total(PaymentMethod.MOMO),
      currency: 'GHS' as const,
      items,
    };
  }

  /** Brings every trip at the bay up to date with the clock. */
  private async refreshBay(bayId: string, now: Date) {
    const trips = await this.prisma.trip.findMany({
      where: {
        bayId,
        status: {
          in: [TripStatus.SCHEDULED, TripStatus.LOADING, TripStatus.FULL],
        },
      },
      orderBy: { loadingStartsAt: 'asc' },
      select: {
        id: true,
        status: true,
        mode: true,
        loadingStartsAt: true,
        departureAt: true,
      },
    });
    for (const trip of trips.filter((t) => isStatusStale(t, now))) {
      await this.trips.refreshStatus(trip.id, now);
    }
  }
}

/** SCHEDULED trips that leave (or start loading) later today. */
function scheduledToday(now: Date): Prisma.TripWhereInput {
  const start = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  const today = { gte: start, lt: new Date(start.getTime() + DAY_MS) };
  return {
    status: TripStatus.SCHEDULED,
    OR: [
      { mode: DepartureMode.FIXED_TIME, departureAt: today },
      { mode: DepartureMode.WHEN_FULL, loadingStartsAt: today },
    ],
  };
}

const nextOrder: Prisma.TripOrderByWithRelationInput[] = [
  { departureAt: { sort: 'asc', nulls: 'last' } },
  { loadingStartsAt: { sort: 'asc', nulls: 'last' } },
];

/** The banner the console design shows above the seat map. */
function banner(trip: {
  status: TripStatus;
  mode: DepartureMode;
  departureAt: Date | null;
  loadingStartsAt: Date | null;
}): string {
  const whenFull = trip.mode === DepartureMode.WHEN_FULL;
  switch (trip.status) {
    case TripStatus.FULL:
      return 'Full — ready to depart';
    case TripStatus.LOADING:
      return whenFull || !trip.departureAt
        ? 'Loading — leaves when full'
        : `Loading — leaves at ${formatTime(trip.departureAt)}`;
    default:
      if (!whenFull && trip.departureAt) {
        return `Scheduled — leaves at ${formatTime(trip.departureAt)}`;
      }
      return trip.loadingStartsAt
        ? `Scheduled — loading from ${formatTime(trip.loadingStartsAt)}`
        : 'Scheduled';
  }
}

/** Past leave-by (fill-and-go) or departure time, but not marked departed. */
function departDue(
  trip: {
    status: TripStatus;
    mode: DepartureMode;
    departureAt: Date | null;
    leaveBy: Date | null;
  },
  now: Date,
): boolean {
  if (trip.status !== TripStatus.LOADING && trip.status !== TripStatus.FULL) {
    return false;
  }
  const due =
    trip.mode === DepartureMode.WHEN_FULL ? trip.leaveBy : trip.departureAt;
  return !!due && due <= now;
}
