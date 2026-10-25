import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  DepartureMode,
  OperatorStatus,
  TripStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  availableSeatWhere,
  buildSeatMap,
  type LayoutSnapshot,
} from '../trips/trip-seats.js';
import { isStatusStale, TripsService } from '../trips/trips.service.js';
import { SearchTripsQueryDto } from './dto/search-trips-query.dto.js';
import { StationsQueryDto } from './dto/stations-query.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Search shows trips you can still book, plus today's full and departed ones
// so the screen can grey them out.
const SEARCHABLE_STATUSES: TripStatus[] = [
  TripStatus.SCHEDULED,
  TripStatus.LOADING,
  TripStatus.FULL,
  TripStatus.DEPARTED,
];

// LOADING first, then bookable trips by time, then what can't be booked.
const STATUS_RANK: Record<TripStatus, number> = {
  LOADING: 0,
  SCHEDULED: 1,
  FULL: 2,
  DEPARTED: 3,
  CANCELLED: 4,
};

const tripSummarySelect = {
  id: true,
  mode: true,
  status: true,
  departureAt: true,
  loadingStartsAt: true,
  leaveBy: true,
  farePesewas: true,
  seatsTotal: true,
  operator: { select: { name: true } },
  bus: { select: { plate: true, type: true } },
  bay: { select: { number: true } },
} satisfies Prisma.TripSelect;

type TripSummaryRow = Prisma.TripGetPayload<{
  select: typeof tripSummarySelect;
}>;

const stationSelect = {
  id: true,
  name: true,
  city: true,
  region: true,
} satisfies Prisma.StationSelect;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
  ) {}

  listStations({ q }: StationsQueryDto) {
    const search = q?.trim();
    return this.prisma.station.findMany({
      where: {
        active: true,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { city: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      select: stationSelect,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
  }

  async searchTrips(query: SearchTripsQueryDto) {
    const now = new Date();
    // Ghana is UTC+0 all year, so a calendar day is a UTC day.
    const dayStart = new Date(`${query.date}T00:00:00Z`);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');

    const fields: Record<string, string[]> = {};
    if (query.from === query.to) {
      fields.to = ['to must be a different station from from'];
    }
    if (dayStart < today) {
      fields.date = ['date cannot be in the past'];
    }
    if (Object.keys(fields).length) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Some fields are invalid',
        HttpStatus.BAD_REQUEST,
        { fields },
      );
    }

    // A fixed-time trip falls on the day it departs; a fill-and-go trip on the
    // day it starts loading.
    const windowStart = query.departAfter
      ? new Date(`${query.date}T${query.departAfter}:00Z`)
      : dayStart;
    const inWindow = { gte: windowStart, lt: dayEnd };

    const where: Prisma.TripWhereInput = {
      onlineBookingOpen: true,
      status: { in: SEARCHABLE_STATUSES },
      route: {
        originStationId: query.from,
        destinationStationId: query.to,
        active: true,
      },
      operator: { status: OperatorStatus.ACTIVE },
      ...(query.busType?.length && {
        bus: { type: { in: query.busType } },
      }),
      OR: [
        { mode: DepartureMode.FIXED_TIME, departureAt: inWindow },
        { mode: DepartureMode.WHEN_FULL, loadingStartsAt: inWindow },
      ],
    };
    let trips = await this.prisma.trip.findMany({
      where,
      select: tripSummarySelect,
    });

    // Bring statuses up to date with the clock, then read again if any moved
    const stale = trips.filter((trip) => isStatusStale(trip, now));
    if (stale.length) {
      for (const trip of stale) await this.trips.refreshStatus(trip.id, now);
      trips = await this.prisma.trip.findMany({
        where,
        select: tripSummarySelect,
      });
    }
    if (query.loadingNow) {
      trips = trips.filter((trip) => trip.status === TripStatus.LOADING);
    }

    const seatsLeft = await this.countSeatsLeft(
      trips.map((t) => t.id),
      now,
    );

    return trips
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          tripTime(a).getTime() - tripTime(b).getTime(),
      )
      .map((trip) => toTripSummary(trip, seatsLeft.get(trip.id) ?? 0));
  }

  async getTrip(id: string) {
    await this.trips.refreshStatus(id);
    const trip = await this.prisma.trip.findFirst({
      where: { id, status: { not: TripStatus.CANCELLED } },
      select: {
        ...tripSummarySelect,
        operator: { select: { name: true, serviceFeePesewas: true } },
        route: {
          select: {
            durationMinutes: true,
            originStation: { select: stationSelect },
            destinationStation: { select: stationSelect },
          },
        },
      },
    });
    if (!trip) throw tripNotFound();

    const seatsLeft = await this.countSeatsLeft([trip.id], new Date());
    return {
      ...toTripSummary(trip, seatsLeft.get(trip.id) ?? 0),
      operator: {
        name: trip.operator.name,
        serviceFeePesewas: trip.operator.serviceFeePesewas,
      },
      route: {
        origin: trip.route.originStation,
        destination: trip.route.destinationStation,
        durationMinutes: trip.route.durationMinutes,
      },
    };
  }

  async getSeatMap(id: string) {
    await this.trips.refreshStatus(id);
    const trip = await this.prisma.trip.findFirst({
      where: { id, status: { not: TripStatus.CANCELLED } },
      select: {
        layoutSnapshot: true,
        seats: { select: { label: true, status: true, holdExpiresAt: true } },
      },
    });
    if (!trip) throw tripNotFound();

    // TODO(phase 2): return the caller's own held seat as "MINE".
    return buildSeatMap(
      trip.layoutSnapshot as unknown as LayoutSnapshot,
      trip.seats,
      new Date(),
    );
  }

  /** Free seats per trip, in one query however many trips there are. */
  private async countSeatsLeft(tripIds: string[], now: Date) {
    if (!tripIds.length) return new Map<string, number>();
    const groups = await this.prisma.tripSeat.groupBy({
      by: ['tripId'],
      where: { tripId: { in: tripIds }, ...availableSeatWhere(now) },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.tripId, g._count._all]));
  }
}

/** When the trip happens: its departure, or when loading starts for fill-and-go. */
function tripTime(
  trip: Pick<TripSummaryRow, 'departureAt' | 'loadingStartsAt'>,
) {
  return trip.departureAt ?? trip.loadingStartsAt ?? new Date(0);
}

function toTripSummary(trip: TripSummaryRow, seatsLeft: number) {
  return {
    id: trip.id,
    operator: { name: trip.operator.name },
    bus: trip.bus,
    mode: trip.mode,
    status: trip.status,
    departureAt: trip.departureAt,
    loadingStartsAt: trip.loadingStartsAt,
    leaveBy: trip.leaveBy,
    bay: trip.bay,
    farePesewas: trip.farePesewas,
    currency: 'GHS' as const,
    seatsLeft,
    seatsTotal: trip.seatsTotal,
  };
}

function tripNotFound() {
  return new AppException('NOT_FOUND', 'Trip not found', HttpStatus.NOT_FOUND);
}
