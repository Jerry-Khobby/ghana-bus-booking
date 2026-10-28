import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BookingChannel,
  BookingStatus,
  BusStatus,
  DepartureMode,
  PaymentMethod,
  PaymentStatus,
  SeatStatus,
  TripStatus,
} from '../generated/prisma/enums.js';
import { MessagesService } from '../messages/messages.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import {
  effectiveSeatStatus,
  seatsFromLayout,
  type LayoutCell,
} from '../trips/trip-seats.js';
import { isStatusStale, TripsService } from '../trips/trips.service.js';
import {
  auditEntry,
  invalidField,
  notFound,
  type AdminContext,
} from './admin-context.js';
import { CreateTripDto, TripsQueryDto, UpdateTripDto } from './dto/trip.dto.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** A fixed-time bus starts loading this long before it leaves, by default. */
const DEFAULT_LOADING_MS = 60 * MINUTE_MS;
/** Journey time assumed when a route has none, for the double-booking check. */
const DEFAULT_JOURNEY_MS = 4 * 60 * MINUTE_MS;
const LOCKED: TripStatus[] = [TripStatus.DEPARTED, TripStatus.CANCELLED];
const SOLD = [
  BookingStatus.CONFIRMED,
  BookingStatus.BOARDED,
  BookingStatus.NO_SHOW,
];
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

const stationSelect = { id: true, name: true, city: true } as const;
const tripListSelect = {
  id: true,
  mode: true,
  status: true,
  departureAt: true,
  loadingStartsAt: true,
  leaveBy: true,
  farePesewas: true,
  onlineBookingOpen: true,
  seatsSold: true,
  seatsTotal: true,
  bus: { select: { id: true, plate: true } },
  bay: { select: { id: true, number: true } },
  route: {
    select: {
      id: true,
      originStation: { select: stationSelect },
      destinationStation: { select: stationSelect },
    },
  },
} satisfies Prisma.TripSelect;
type TripRow = Prisma.TripGetPayload<{ select: typeof tripListSelect }>;

/** When a trip occupies its bus, for the double-booking check. */
interface Schedule {
  mode: DepartureMode;
  departureAt: Date | null;
  loadingStartsAt: Date | null;
  leaveBy: Date | null;
}

/** Trips from the operator's side: plan, change, cancel, and today's numbers. */
@Injectable()
export class AdminTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly trips: TripsService,
    private readonly messages: MessagesService,
    private readonly realtime: RealtimeService,
    private readonly payments: PaymentsService,
  ) {}

  /** GET /admin/trips */
  async list(ctx: AdminContext, query: TripsQueryDto) {
    const where = this.listWhere(ctx, query);
    const read = () =>
      this.prisma.trip.findMany({
        where,
        select: tripListSelect,
        orderBy: [
          { departureAt: { sort: 'asc', nulls: 'last' } },
          { loadingStartsAt: { sort: 'asc', nulls: 'last' } },
          { id: 'asc' },
        ],
        take: query.limit + 1,
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      });

    let rows = await read();
    const now = new Date();
    const stale = rows.filter((t) => isStatusStale(t, now));
    if (stale.length) {
      for (const t of stale) await this.trips.refreshStatus(t.id, now);
      rows = await read();
    }
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toListItem),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }

  /** GET /admin/trips/:id: the trip with its seat counts and takings. */
  async get(ctx: AdminContext, id: string) {
    await this.trips.refreshStatus(id);
    const trip = await this.prisma.trip.findFirst({
      where: { id, operatorId: ctx.operatorId },
      select: {
        ...tripListSelect,
        cancelReason: true,
        departedAt: true,
        cancelledAt: true,
        route: {
          select: {
            ...tripListSelect.route.select,
            baseFarePesewas: true,
            durationMinutes: true,
          },
        },
        seats: {
          select: {
            status: true,
            holdExpiresAt: true,
            booking: { select: { status: true, channel: true } },
          },
        },
      },
    });
    if (!trip) throw notFound('Trip');

    const now = new Date();
    const seats = trip.seats.map((seat) => ({
      status: effectiveSeatStatus(seat, now),
      booking: seat.booking,
    }));
    const sold = seats.filter((s) => s.status === SeatStatus.SOLD);
    const revenue = await this.prisma.payment.aggregate({
      where: {
        status: PaymentStatus.SUCCESS,
        booking: { tripId: id, status: { in: SOLD } },
      },
      _sum: { amountPesewas: true },
    });
    const { seats: _seats, ...rest } = trip;

    return {
      ...toListItem(rest),
      cancelReason: trip.cancelReason,
      departedAt: trip.departedAt,
      cancelledAt: trip.cancelledAt,
      route: {
        ...toListItem(rest).route,
        baseFarePesewas: trip.route.baseFarePesewas,
        durationMinutes: trip.route.durationMinutes,
      },
      counts: {
        sold: sold.length,
        online: sold.filter((s) => s.booking?.channel === BookingChannel.ONLINE)
          .length,
        walkIn: sold.filter(
          (s) => s.booking?.channel === BookingChannel.WALK_IN,
        ).length,
        boarded: seats.filter(
          (s) => s.booking?.status === BookingStatus.BOARDED,
        ).length,
        held: seats.filter((s) => s.status === SeatStatus.HELD).length,
        free: seats.filter((s) => s.status === SeatStatus.AVAILABLE).length,
      },
      revenuePesewas: revenue._sum.amountPesewas ?? 0,
    };
  }

  /** POST /admin/trips: publish a trip, with one TripSeat per seat. */
  async create(ctx: AdminContext, dto: CreateTripDto) {
    const route = await this.findRoute(ctx, dto.routeId);
    const bus = await this.findBus(ctx, dto.busId);
    await this.checkBay(ctx, dto.bayId, route);
    const schedule = this.schedule(dto.mode, dto);
    await this.checkBusFree(bus.id, schedule, route.durationMinutes);

    const layout = bus.layout;
    const cells = layout.cells as unknown as LayoutCell[];
    const trip = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          operatorId: ctx.operatorId,
          routeId: route.id,
          busId: bus.id,
          bayId: dto.bayId,
          ...schedule,
          farePesewas: dto.farePesewas ?? route.baseFarePesewas,
          onlineBookingOpen: dto.onlineBookingOpen ?? true,
          seatsTotal: layout.seatCount,
          // Later layout edits never change this trip
          layoutSnapshot: {
            rows: layout.rows,
            cols: layout.cols,
            cells,
          } as unknown as Prisma.InputJsonValue,
          createdById: ctx.staffId,
        },
        select: { id: true },
      });
      await tx.tripSeat.createMany({
        data: seatsFromLayout(cells).map((seat) => ({
          ...seat,
          tripId: trip.id,
        })),
      });
      await this.audit.record(
        tx,
        auditEntry(ctx, 'trip.create', 'Trip', trip.id, null, {
          ...dto,
          layoutVersion: layout.version,
        }),
      );
      return trip;
    }, TX_OPTIONS);
    return this.get(ctx, trip.id);
  }

  /**
   * PATCH /admin/trips/:id. Once seats are sold, a new bus must have the same
   * layout, fare changes apply to new sales only, and a new departure time is
   * emailed to every confirmed passenger.
   */
  async update(ctx: AdminContext, id: string, dto: UpdateTripDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, operatorId: ctx.operatorId },
      select: {
        id: true,
        status: true,
        routeId: true,
        busId: true,
        bayId: true,
        mode: true,
        departureAt: true,
        loadingStartsAt: true,
        leaveBy: true,
        farePesewas: true,
        onlineBookingOpen: true,
        bus: { select: { layoutId: true } },
      },
    });
    if (!trip) throw notFound('Trip');
    if (LOCKED.includes(trip.status)) throw tripLocked(trip.status);

    const bookings = await this.prisma.booking.count({ where: { tripId: id } });
    const route =
      dto.routeId && dto.routeId !== trip.routeId
        ? await this.findRoute(ctx, dto.routeId)
        : await this.findRoute(ctx, trip.routeId);
    if (dto.routeId && dto.routeId !== trip.routeId && bookings) {
      throw new AppException(
        'INVALID_STATE',
        "A trip with bookings can't move to another route",
        HttpStatus.CONFLICT,
      );
    }

    const busId = dto.busId ?? trip.busId;
    const bus = await this.findBus(ctx, busId);
    if (busId !== trip.busId && bus.layoutId !== trip.bus.layoutId) {
      // Passengers hold seat numbers from the old layout
      if (bookings) {
        throw new AppException(
          'LAYOUT_MISMATCH',
          'Seats are booked, so the new bus must have the same seat layout',
          HttpStatus.CONFLICT,
        );
      }
    }
    const bayId = dto.bayId ?? trip.bayId;
    if (dto.bayId || dto.routeId) await this.checkBay(ctx, bayId, route);

    const timesChanged =
      dto.mode !== undefined ||
      dto.departureAt !== undefined ||
      dto.loadingStartsAt !== undefined ||
      dto.leaveBy !== undefined;
    const schedule = timesChanged
      ? this.schedule(dto.mode ?? trip.mode, {
          departureAt: dto.departureAt ?? trip.departureAt?.toISOString(),
          loadingStartsAt:
            dto.loadingStartsAt ??
            (dto.departureAt ? undefined : trip.loadingStartsAt?.toISOString()),
          leaveBy: dto.leaveBy ?? trip.leaveBy?.toISOString(),
        })
      : null;
    if (schedule || busId !== trip.busId) {
      await this.checkBusFree(
        busId,
        schedule ?? trip,
        route.durationMinutes,
        trip.id,
      );
    }

    const departureMoved =
      !!schedule &&
      (schedule.departureAt?.getTime() !== trip.departureAt?.getTime() ||
        schedule.leaveBy?.getTime() !== trip.leaveBy?.getTime());
    const newBusLayout =
      busId !== trip.busId && bus.layoutId !== trip.bus.layoutId;

    const outbox = await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id },
        data: {
          routeId: route.id,
          busId,
          bayId,
          ...schedule,
          farePesewas: dto.farePesewas,
          onlineBookingOpen: dto.onlineBookingOpen,
          // No bookings yet, so the trip can take the new bus's layout
          ...(newBusLayout && {
            seatsTotal: bus.layout.seatCount,
            layoutSnapshot: {
              rows: bus.layout.rows,
              cols: bus.layout.cols,
              cells: bus.layout.cells,
            } as unknown as Prisma.InputJsonValue,
          }),
        },
      });
      if (newBusLayout) {
        await tx.tripSeat.deleteMany({ where: { tripId: id } });
        await tx.tripSeat.createMany({
          data: seatsFromLayout(
            bus.layout.cells as unknown as LayoutCell[],
          ).map((seat) => ({ ...seat, tripId: id })),
        });
      }
      await this.audit.record(
        tx,
        auditEntry(
          ctx,
          'trip.update',
          'Trip',
          id,
          {
            busId: trip.busId,
            bayId: trip.bayId,
            mode: trip.mode,
            departureAt: trip.departureAt,
            loadingStartsAt: trip.loadingStartsAt,
            leaveBy: trip.leaveBy,
            farePesewas: trip.farePesewas,
            onlineBookingOpen: trip.onlineBookingOpen,
          },
          dto,
        ),
      );

      if (!departureMoved) return [];
      const confirmed = await tx.booking.findMany({
        where: { tripId: id, status: BookingStatus.CONFIRMED },
        select: { id: true },
      });
      const ids: (string | null)[] = [];
      for (const b of confirmed) {
        ids.push(await this.messages.queueTripChanged(tx, b.id));
      }
      return ids;
    }, TX_OPTIONS);

    await this.messages.send(outbox);
    this.realtime.tripChanged(id);
    return {
      ...(await this.get(ctx, id)),
      passengersEmailed: outbox.filter(Boolean).length,
    };
  }

  /**
   * POST /admin/trips/:id/cancel. Holds are released, online and MoMo tickets
   * are refunded, cash walk-ins are listed for the admin to repay at the
   * station, and every affected passenger is emailed.
   */
  async cancel(ctx: AdminContext, id: string, reason: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, operatorId: ctx.operatorId },
      select: { id: true, status: true },
    });
    if (!trip) throw notFound('Trip');
    if (LOCKED.includes(trip.status)) throw tripLocked(trip.status);

    const now = new Date();
    const { outbox, cashToRepay, refunds } = await this.prisma.$transaction(
      async (tx) => {
        const { count } = await tx.trip.updateMany({
          where: { id, status: { notIn: LOCKED } },
          data: {
            status: TripStatus.CANCELLED,
            cancelledAt: now,
            cancelReason: reason,
          },
        });
        if (!count) throw tripLocked(TripStatus.CANCELLED);

        // Holds and pending payments end; a payment that still succeeds is
        // refunded when it lands (PaymentsService sees the cancelled trip)
        await tx.tripSeat.updateMany({
          where: { tripId: id, status: SeatStatus.HELD },
          data: {
            status: SeatStatus.AVAILABLE,
            holdExpiresAt: null,
            bookingId: null,
          },
        });
        await tx.booking.updateMany({
          where: {
            tripId: id,
            status: { in: [BookingStatus.HELD, BookingStatus.PENDING_PAYMENT] },
          },
          data: { status: BookingStatus.CANCELLED, cancelledAt: now },
        });

        const confirmed = await tx.booking.findMany({
          where: { tripId: id, status: BookingStatus.CONFIRMED },
          select: {
            id: true,
            code: true,
            seatLabel: true,
            passengerName: true,
            contactPhone: true,
            totalPesewas: true,
            soldBy: { select: { name: true } },
            payments: {
              where: { status: PaymentStatus.SUCCESS },
              select: { method: true },
              take: 1,
            },
          },
        });
        const outbox: (string | null)[] = [];
        const cashToRepay: {
          code: string;
          seatLabel: string;
          passengerName: string | null;
          amountPesewas: number;
          soldBy: string | null;
        }[] = [];
        let refunds = 0;
        for (const booking of confirmed) {
          const cash = booking.payments[0]?.method === PaymentMethod.CASH;
          await tx.booking.update({
            where: { id: booking.id },
            data: cash
              ? { status: BookingStatus.CANCELLED, cancelledAt: now }
              : { status: BookingStatus.REFUND_PENDING },
          });
          if (cash) {
            cashToRepay.push({
              code: booking.code,
              seatLabel: booking.seatLabel,
              passengerName: booking.passengerName,
              amountPesewas: booking.totalPesewas,
              soldBy: booking.soldBy?.name ?? null,
            });
          } else {
            refunds++;
          }
          outbox.push(
            await this.messages.queueTripCancelled(
              tx,
              booking.id,
              cash ? 'cash' : 'online',
            ),
          );
        }

        await this.audit.record(
          tx,
          auditEntry(
            ctx,
            'trip.cancel',
            'Trip',
            id,
            { status: trip.status },
            {
              status: TripStatus.CANCELLED,
              reason,
              refunds,
              cash: cashToRepay.length,
            },
          ),
        );
        return { outbox, cashToRepay, refunds };
      },
      TX_OPTIONS,
    );

    await this.messages.send(outbox);
    this.realtime.tripChanged(id);
    // Right after commit; the tick retries any that fail
    const refundsRequested = refunds ? await this.payments.requestRefunds() : 0;
    return {
      id,
      status: TripStatus.CANCELLED,
      refundsPending: refunds,
      refundsRequested,
      cashToRepay,
      passengersEmailed: outbox.filter(Boolean).length,
    };
  }

  /**
   * GET /admin/overview?date=. Revenue counts successful payments only; seat
   * fill is sold ÷ total over the day's trips that have started loading.
   */
  async overview(ctx: AdminContext, date?: string) {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00Z`);
    const range = { gte: start, lt: new Date(start.getTime() + DAY_MS) };

    const trips = (
      await this.list(ctx, { date: day, limit: 100 } as TripsQueryDto)
    ).items.filter((t) => t.status !== TripStatus.CANCELLED);
    const tripIds = trips.map((t) => t.id);

    const revenueByTrip = await this.prisma.payment.groupBy({
      by: ['bookingId'],
      where: {
        status: PaymentStatus.SUCCESS,
        booking: { tripId: { in: tripIds }, status: { in: SOLD } },
      },
      _sum: { amountPesewas: true },
    });
    const bookingTrips = await this.prisma.booking.findMany({
      where: { id: { in: revenueByTrip.map((r) => r.bookingId) } },
      select: { id: true, tripId: true },
    });
    const tripOf = new Map(bookingTrips.map((b) => [b.id, b.tripId]));
    const revenue = new Map<string, number>();
    for (const r of revenueByTrip) {
      const tripId = tripOf.get(r.bookingId)!;
      revenue.set(
        tripId,
        (revenue.get(tripId) ?? 0) + (r._sum.amountPesewas ?? 0),
      );
    }

    const started = trips.filter((t) =>
      (
        [
          TripStatus.LOADING,
          TripStatus.FULL,
          TripStatus.DEPARTED,
        ] as TripStatus[]
      ).includes(t.status),
    );
    const startedSeats = started.reduce((n, t) => n + t.total, 0);
    const failedPayments = await this.prisma.payment.count({
      where: {
        status: { in: [PaymentStatus.FAILED, PaymentStatus.ABANDONED] },
        createdAt: range,
        booking: { operatorId: ctx.operatorId },
      },
    });

    return {
      date: day,
      ticketsSold: trips.reduce((n, t) => n + t.sold, 0),
      revenuePesewas: [...revenue.values()].reduce((a, b) => a + b, 0),
      currency: 'GHS' as const,
      seatFillPercent: startedSeats
        ? Math.round(
            (started.reduce((n, t) => n + t.sold, 0) / startedSeats) * 100,
          )
        : 0,
      failedPayments,
      trips: trips.map((t) => ({
        id: t.id,
        route: t.route,
        plate: t.bus.plate,
        when: t.when,
        mode: t.mode,
        bay: t.bay,
        status: t.status,
        sold: t.sold,
        total: t.total,
        revenuePesewas: revenue.get(t.id) ?? 0,
      })),
    };
  }

  private listWhere(
    ctx: AdminContext,
    query: TripsQueryDto,
  ): Prisma.TripWhereInput {
    const from =
      query.from ?? query.date ?? new Date().toISOString().slice(0, 10);
    const to = query.to ?? query.date ?? from;
    const range = {
      gte: new Date(`${from}T00:00:00Z`),
      lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + DAY_MS),
    };
    return {
      operatorId: ctx.operatorId,
      routeId: query.routeId,
      ...(query.status?.length && { status: { in: query.status } }),
      OR: [
        { mode: DepartureMode.FIXED_TIME, departureAt: range },
        { mode: DepartureMode.WHEN_FULL, loadingStartsAt: range },
      ],
    };
  }

  /** The mode rules, returning the times to store. */
  private schedule(
    mode: DepartureMode,
    times: { departureAt?: string; loadingStartsAt?: string; leaveBy?: string },
  ): Schedule {
    const now = Date.now();
    const at = (value?: string) => (value ? new Date(value) : null);
    if (mode === DepartureMode.FIXED_TIME) {
      const departureAt = at(times.departureAt);
      if (!departureAt) {
        throw invalidField(
          'departureAt',
          'A fixed-time trip needs a departure time',
        );
      }
      if (departureAt.getTime() <= now) {
        throw invalidField('departureAt', 'The departure time has passed');
      }
      const loadingStartsAt =
        at(times.loadingStartsAt) ??
        new Date(departureAt.getTime() - DEFAULT_LOADING_MS);
      if (loadingStartsAt >= departureAt) {
        throw invalidField(
          'loadingStartsAt',
          'Loading must start before departure',
        );
      }
      return { mode, departureAt, loadingStartsAt, leaveBy: null };
    }

    const loadingStartsAt = at(times.loadingStartsAt);
    const leaveBy = at(times.leaveBy);
    if (!loadingStartsAt) {
      throw invalidField(
        'loadingStartsAt',
        'A fill-and-go trip needs a loading start',
      );
    }
    if (!leaveBy) {
      throw invalidField(
        'leaveBy',
        'A fill-and-go trip needs a latest departure',
      );
    }
    if (leaveBy <= loadingStartsAt) {
      throw invalidField(
        'leaveBy',
        'The latest departure must be after loading starts',
      );
    }
    if (leaveBy.getTime() <= now) {
      throw invalidField('leaveBy', 'The latest departure has passed');
    }
    return { mode, departureAt: null, loadingStartsAt, leaveBy };
  }

  /** BUS_DOUBLE_BOOKED if the bus is already on a trip at that time. */
  private async checkBusFree(
    busId: string,
    schedule: Schedule,
    durationMinutes: number | null,
    ignoreTripId?: string,
  ) {
    const journeyMs = durationMinutes
      ? durationMinutes * MINUTE_MS
      : DEFAULT_JOURNEY_MS;
    const [start, end] = busWindow(schedule, journeyMs);
    const others = await this.prisma.trip.findMany({
      where: {
        busId,
        id: ignoreTripId ? { not: ignoreTripId } : undefined,
        status: { notIn: LOCKED },
      },
      select: {
        id: true,
        mode: true,
        departureAt: true,
        loadingStartsAt: true,
        leaveBy: true,
        route: { select: { durationMinutes: true } },
      },
    });
    const clash = others.find((other) => {
      const [s, e] = busWindow(
        other,
        other.route.durationMinutes
          ? other.route.durationMinutes * MINUTE_MS
          : DEFAULT_JOURNEY_MS,
      );
      return start < e && s < end;
    });
    if (clash) {
      throw new AppException(
        'BUS_DOUBLE_BOOKED',
        'This bus already has a trip at that time',
        HttpStatus.CONFLICT,
        { tripId: clash.id },
      );
    }
  }

  private async findRoute(ctx: AdminContext, id: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, operatorId: ctx.operatorId },
      select: {
        id: true,
        active: true,
        baseFarePesewas: true,
        durationMinutes: true,
        originStationId: true,
        originStation: { select: { name: true, city: true } },
      },
    });
    if (!route) throw invalidField('routeId', 'Pick one of your routes');
    if (!route.active) throw invalidField('routeId', 'This route is off sale');
    return route;
  }

  private async findBus(ctx: AdminContext, id: string) {
    const bus = await this.prisma.bus.findFirst({
      where: { id, operatorId: ctx.operatorId },
      select: {
        id: true,
        status: true,
        layoutId: true,
        layout: {
          select: {
            rows: true,
            cols: true,
            cells: true,
            seatCount: true,
            version: true,
          },
        },
      },
    });
    if (!bus) throw invalidField('busId', 'Pick one of your buses');
    if (bus.status !== BusStatus.ACTIVE) {
      throw invalidField('busId', 'This bus is not on the road');
    }
    return bus;
  }

  private async checkBay(
    ctx: AdminContext,
    bayId: string,
    route: {
      originStationId: string;
      originStation: { name: string; city: string };
    },
  ) {
    const bay = await this.prisma.bay.findFirst({
      where: { id: bayId, operatorId: ctx.operatorId },
      select: { stationId: true },
    });
    if (!bay || bay.stationId !== route.originStationId) {
      throw invalidField(
        'bayId',
        `Pick a bay at ${route.originStation.city} (${route.originStation.name}), where the route starts`,
      );
    }
  }
}

/** From loading until the bus is back: the time it can't do another trip. */
function busWindow(trip: Schedule, journeyMs: number): [number, number] {
  const leaves =
    trip.departureAt ??
    trip.leaveBy ??
    new Date((trip.loadingStartsAt?.getTime() ?? 0) + DEFAULT_LOADING_MS);
  const starts =
    trip.loadingStartsAt ?? new Date(leaves.getTime() - DEFAULT_LOADING_MS);
  return [starts.getTime(), leaves.getTime() + journeyMs];
}

function toListItem(trip: TripRow) {
  return {
    id: trip.id,
    route: {
      id: trip.route.id,
      origin: trip.route.originStation,
      destination: trip.route.destinationStation,
    },
    bus: trip.bus,
    bay: trip.bay,
    mode: trip.mode,
    status: trip.status,
    when: trip.departureAt ?? trip.loadingStartsAt,
    departureAt: trip.departureAt,
    loadingStartsAt: trip.loadingStartsAt,
    leaveBy: trip.leaveBy,
    farePesewas: trip.farePesewas,
    currency: 'GHS' as const,
    onlineBookingOpen: trip.onlineBookingOpen,
    sold: trip.seatsSold,
    total: trip.seatsTotal,
    editable:
      trip.status === TripStatus.SCHEDULED ||
      trip.status === TripStatus.LOADING,
  };
}

function tripLocked(status: TripStatus) {
  return new AppException(
    'TRIP_LOCKED',
    `This trip has ${status === TripStatus.DEPARTED ? 'departed' : 'been cancelled'}`,
    HttpStatus.CONFLICT,
  );
}
