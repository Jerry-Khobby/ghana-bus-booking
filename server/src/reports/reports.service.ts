import { Injectable } from '@nestjs/common';
import type { AdminContext } from '../admin/admin-context.js';
import { Prisma } from '../generated/prisma/client.js';
import { PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ReportRange } from './report-range.js';

// Only confirmed money counts: successful payments on bookings that are (or
// were) real tickets. Literal SQL, never user input.
const SOLD = Prisma.sql`('CONFIRMED', 'BOARDED', 'NO_SHOW')`;
const STARTED = Prisma.sql`('LOADING', 'FULL', 'DEPARTED')`;
/** When a trip happens: its departure, or loading start for fill-and-go. */
const TRIP_TIME = Prisma.sql`COALESCE(t."departureAt", t."loadingStartsAt")`;
const EXPORT_BATCH = 500;

const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : 0;

/**
 * The Reports screen. Tickets and revenue count by sale date (when the
 * booking was confirmed); seat fill and no-shows by trip date, since they only
 * make sense once a bus has loaded or left. Written as SQL: Prisma's query
 * builder is awkward for group-bys like these.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /reports/summary: the four tiles. */
  async summary(ctx: AdminContext, range: ReportRange) {
    const op = ctx.operatorId;
    const [money] = await this.prisma.$queryRaw<{ revenue: bigint }[]>`
      SELECT COALESCE(SUM(p."amountPesewas"), 0)::bigint AS revenue
      FROM "Payment" p
      JOIN "Booking" b ON b.id = p."bookingId"
      WHERE b."operatorId" = ${op}::uuid
        AND p.status = 'SUCCESS'
        AND b.status IN ${SOLD}
        AND b."confirmedAt" >= ${range.start} AND b."confirmedAt" < ${range.end}`;
    const [tickets] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Booking" b
      WHERE b."operatorId" = ${op}::uuid
        AND b.status IN ${SOLD}
        AND b."confirmedAt" >= ${range.start} AND b."confirmedAt" < ${range.end}`;
    const [fill] = await this.prisma.$queryRaw<
      { sold: bigint; seats: bigint }[]
    >`
      SELECT COALESCE(SUM(t."seatsSold"), 0)::bigint AS sold,
             COALESCE(SUM(t."seatsTotal"), 0)::bigint AS seats
      FROM "Trip" t
      WHERE t."operatorId" = ${op}::uuid
        AND t.status IN ${STARTED}
        AND ${TRIP_TIME} >= ${range.start} AND ${TRIP_TIME} < ${range.end}`;
    const [noShows] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Booking" b
      JOIN "Trip" t ON t.id = b."tripId"
      WHERE b."operatorId" = ${op}::uuid
        AND b.status = 'NO_SHOW'
        AND ${TRIP_TIME} >= ${range.start} AND ${TRIP_TIME} < ${range.end}`;

    return {
      ...rangeOf(range),
      revenuePesewas: Number(money.revenue),
      currency: 'GHS' as const,
      ticketsSold: Number(tickets.count),
      avgSeatFillPercent: percent(Number(fill.sold), Number(fill.seats)),
      noShows: Number(noShows.count),
    };
  }

  /** GET /reports/daily: tickets sold per day, every day listed. */
  async daily(ctx: AdminContext, range: ReportRange) {
    const rows = await this.prisma.$queryRaw<
      { date: string; online: bigint; walkIn: bigint }[]
    >`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
             COUNT(b.id) FILTER (WHERE b.channel = 'ONLINE')::bigint AS online,
             COUNT(b.id) FILTER (WHERE b.channel = 'WALK_IN')::bigint AS "walkIn"
      FROM generate_series(${range.from}::date, ${range.to}::date, interval '1 day') AS d(day)
      LEFT JOIN "Booking" b
        ON b."operatorId" = ${ctx.operatorId}::uuid
       AND b.status IN ${SOLD}
       AND (b."confirmedAt" AT TIME ZONE 'UTC')::date = d.day
      GROUP BY d.day
      ORDER BY d.day`;
    return rows.map((r) => ({
      date: r.date,
      online: Number(r.online),
      walkIn: Number(r.walkIn),
    }));
  }

  /** GET /reports/by-route: trips, seat fill and revenue per route. */
  async byRoute(ctx: AdminContext, range: ReportRange) {
    const op = ctx.operatorId;
    const trips = await this.prisma.$queryRaw<
      { routeId: string; trips: bigint; sold: bigint; seats: bigint }[]
    >`
      SELECT t."routeId" AS "routeId",
             COUNT(*)::bigint AS trips,
             COALESCE(SUM(t."seatsSold") FILTER (WHERE t.status IN ${STARTED}), 0)::bigint AS sold,
             COALESCE(SUM(t."seatsTotal") FILTER (WHERE t.status IN ${STARTED}), 0)::bigint AS seats
      FROM "Trip" t
      WHERE t."operatorId" = ${op}::uuid
        AND t.status <> 'CANCELLED'
        AND ${TRIP_TIME} >= ${range.start} AND ${TRIP_TIME} < ${range.end}
      GROUP BY t."routeId"`;
    const revenue = await this.prisma.$queryRaw<
      { routeId: string; revenue: bigint }[]
    >`
      SELECT t."routeId" AS "routeId",
             COALESCE(SUM(p."amountPesewas"), 0)::bigint AS revenue
      FROM "Payment" p
      JOIN "Booking" b ON b.id = p."bookingId"
      JOIN "Trip" t ON t.id = b."tripId"
      WHERE b."operatorId" = ${op}::uuid
        AND p.status = 'SUCCESS'
        AND b.status IN ${SOLD}
        AND b."confirmedAt" >= ${range.start} AND b."confirmedAt" < ${range.end}
      GROUP BY t."routeId"`;

    const tripsBy = new Map(trips.map((t) => [t.routeId, t]));
    const revenueBy = new Map(
      revenue.map((r) => [r.routeId, Number(r.revenue)]),
    );
    const routes = await this.prisma.route.findMany({
      where: {
        operatorId: op,
        OR: [
          { active: true },
          { id: { in: [...tripsBy.keys(), ...revenueBy.keys()] } },
        ],
      },
      select: {
        id: true,
        originStation: { select: { name: true, city: true } },
        destinationStation: { select: { name: true, city: true } },
      },
    });

    return routes
      .map((route) => {
        const t = tripsBy.get(route.id);
        return {
          route: {
            id: route.id,
            origin: route.originStation,
            destination: route.destinationStation,
          },
          trips: Number(t?.trips ?? 0),
          seatFillPercent: percent(Number(t?.sold ?? 0), Number(t?.seats ?? 0)),
          revenuePesewas: revenueBy.get(route.id) ?? 0,
          currency: 'GHS' as const,
        };
      })
      .sort((a, b) => b.revenuePesewas - a.revenuePesewas || b.trips - a.trips);
  }

  /** GET /reports/cash-by-agent: walk-in cash each agent took, and still holds. */
  async cashByAgent(ctx: AdminContext, range: ReportRange) {
    const rows = await this.prisma.$queryRaw<
      { agentId: string; tickets: bigint; cash: bigint; unsettled: bigint }[]
    >`
      SELECT c."agentId" AS "agentId",
             COUNT(*)::bigint AS tickets,
             SUM(c."amountPesewas")::bigint AS cash,
             COALESCE(SUM(c."amountPesewas") FILTER (WHERE c."settledAt" IS NULL), 0)::bigint AS unsettled
      FROM "CashEntry" c
      WHERE c."operatorId" = ${ctx.operatorId}::uuid
        AND c."createdAt" >= ${range.start} AND c."createdAt" < ${range.end}
      GROUP BY c."agentId"`;
    const agents = await this.prisma.staffUser.findMany({
      where: { id: { in: rows.map((r) => r.agentId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(agents.map((a) => [a.id, a]));
    return rows
      .map((r) => ({
        agent: byId.get(r.agentId)!,
        tickets: Number(r.tickets),
        cashPesewas: Number(r.cash),
        unsettledPesewas: Number(r.unsettled),
        currency: 'GHS' as const,
      }))
      .sort((a, b) => b.cashPesewas - a.cashPesewas);
  }

  /**
   * GET /reports/export.csv: one line per ticket sold in the range, produced
   * in batches so a month of data never sits in memory at once.
   */
  async *exportCsv(
    ctx: AdminContext,
    range: ReportRange,
  ): AsyncGenerator<string> {
    yield csvLine([
      'date',
      'code',
      'route',
      'plate',
      'seat',
      'channel',
      'method',
      'amount GHS',
      'status',
      'agent',
    ]);

    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.booking.findMany({
        where: {
          operatorId: ctx.operatorId,
          confirmedAt: { gte: range.start, lt: range.end },
        },
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
        take: EXPORT_BATCH,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        select: {
          id: true,
          code: true,
          confirmedAt: true,
          seatLabel: true,
          channel: true,
          status: true,
          totalPesewas: true,
          soldBy: { select: { name: true } },
          payments: {
            where: { status: PaymentStatus.SUCCESS },
            select: { method: true },
            take: 1,
          },
          trip: {
            select: {
              bus: { select: { plate: true } },
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
      for (const b of batch) {
        yield csvLine([
          b.confirmedAt!.toISOString(),
          b.code,
          `${b.trip.route.originStation.city} → ${b.trip.route.destinationStation.city}`,
          b.trip.bus.plate,
          b.seatLabel,
          b.channel,
          b.payments[0]?.method ?? '',
          (b.totalPesewas / 100).toFixed(2),
          b.status,
          b.soldBy?.name ?? '',
        ]);
      }
      if (batch.length < EXPORT_BATCH) return;
      cursor = batch[batch.length - 1].id;
    }
  }
}

function rangeOf(range: ReportRange) {
  return { from: range.from, to: range.to };
}

/** RFC 4180 quoting, plus a guard so spreadsheets don't run cells as formulas. */
export function csvLine(values: string[]): string {
  return (
    values
      .map((value) => {
        const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
        return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
      })
      .join(',') + '\r\n'
  );
}
