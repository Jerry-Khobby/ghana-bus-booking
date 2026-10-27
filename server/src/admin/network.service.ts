import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { DepartureMode, TripStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  auditEntry,
  invalidField,
  notFound,
  type AdminContext,
} from './admin-context.js';
import {
  CreateBayDto,
  CreateRouteDto,
  UpdateFaresDto,
  UpdateRouteDto,
} from './dto/network.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const stationSelect = { id: true, name: true, city: true } as const;

/** Routes, fares and bays: where an operator runs and loads its buses. */
@Injectable()
export class NetworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** GET /admin/routes, with how many trips each has today. */
  async listRoutes(ctx: AdminContext) {
    const start = new Date(
      new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
    );
    const today = { gte: start, lt: new Date(start.getTime() + DAY_MS) };
    const routes = await this.prisma.route.findMany({
      where: { operatorId: ctx.operatorId },
      orderBy: [
        { originStation: { city: 'asc' } },
        { destinationStation: { city: 'asc' } },
      ],
      select: {
        id: true,
        baseFarePesewas: true,
        durationMinutes: true,
        active: true,
        originStation: { select: stationSelect },
        destinationStation: { select: stationSelect },
        _count: {
          select: {
            trips: {
              where: {
                status: { not: TripStatus.CANCELLED },
                OR: [
                  { mode: DepartureMode.FIXED_TIME, departureAt: today },
                  { mode: DepartureMode.WHEN_FULL, loadingStartsAt: today },
                ],
              },
            },
          },
        },
      },
    });
    return routes.map(
      ({ originStation, destinationStation, _count, ...r }) => ({
        ...r,
        currency: 'GHS' as const,
        origin: originStation,
        destination: destinationStation,
        tripsToday: _count.trips,
      }),
    );
  }

  /** POST /admin/routes */
  async createRoute(ctx: AdminContext, dto: CreateRouteDto) {
    if (dto.originStationId === dto.destinationStationId) {
      throw invalidField(
        'destinationStationId',
        'A route must end at a different station',
      );
    }
    const stations = await this.prisma.station.count({
      where: {
        id: { in: [dto.originStationId, dto.destinationStationId] },
        active: true,
      },
    });
    if (stations !== 2) {
      throw invalidField('originStationId', 'Pick two active stations');
    }
    const existing = await this.prisma.route.findFirst({
      where: {
        operatorId: ctx.operatorId,
        originStationId: dto.originStationId,
        destinationStationId: dto.destinationStationId,
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        'ROUTE_EXISTS',
        'You already run this route',
        HttpStatus.CONFLICT,
        { routeId: existing.id },
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: { operatorId: ctx.operatorId, ...dto },
      });
      await this.audit.record(
        tx,
        auditEntry(ctx, 'route.create', 'Route', route.id, null, dto),
      );
      return route;
    });
  }

  /** PATCH /admin/routes/:id: journey time, or taking it off sale. */
  async updateRoute(ctx: AdminContext, id: string, dto: UpdateRouteDto) {
    const route = await this.prisma.route.findFirst({
      where: { id, operatorId: ctx.operatorId },
    });
    if (!route) throw notFound('Route');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.route.update({ where: { id }, data: dto });
      await this.audit.record(
        tx,
        auditEntry(
          ctx,
          'route.update',
          'Route',
          id,
          { durationMinutes: route.durationMinutes, active: route.active },
          { durationMinutes: updated.durationMinutes, active: updated.active },
        ),
      );
      return updated;
    });
  }

  /**
   * PATCH /admin/routes/fares: all or nothing, one audit row per change.
   * New fares apply to trips created afterwards; existing trips and sold
   * tickets keep their price.
   */
  async updateFares(ctx: AdminContext, dto: UpdateFaresDto) {
    const ids = [...new Set(dto.fares.map((f) => f.routeId))];
    const routes = await this.prisma.route.findMany({
      where: { id: { in: ids }, operatorId: ctx.operatorId },
      select: { id: true, baseFarePesewas: true },
    });
    if (routes.length !== ids.length) throw notFound('Route');
    const oldFare = new Map(routes.map((r) => [r.id, r.baseFarePesewas]));

    await this.prisma.$transaction(async (tx) => {
      for (const { routeId, baseFarePesewas } of dto.fares) {
        if (oldFare.get(routeId) === baseFarePesewas) continue;
        await tx.route.update({
          where: { id: routeId },
          data: { baseFarePesewas },
        });
        await this.audit.record(
          tx,
          auditEntry(
            ctx,
            'route.fare',
            'Route',
            routeId,
            { baseFarePesewas: oldFare.get(routeId) },
            { baseFarePesewas },
          ),
        );
      }
    });
    return this.listRoutes(ctx);
  }

  /** GET /admin/bays?stationId= */
  listBays(ctx: AdminContext, stationId?: string) {
    return this.prisma.bay.findMany({
      where: { operatorId: ctx.operatorId, stationId },
      orderBy: [{ station: { city: 'asc' } }, { number: 'asc' }],
      select: {
        id: true,
        number: true,
        station: { select: stationSelect },
      },
    });
  }

  /** POST /admin/bays */
  async createBay(ctx: AdminContext, dto: CreateBayDto) {
    const station = await this.prisma.station.findFirst({
      where: { id: dto.stationId, active: true },
      select: { id: true },
    });
    if (!station) throw invalidField('stationId', 'Pick an active station');
    const taken = await this.prisma.bay.findFirst({
      where: { operatorId: ctx.operatorId, ...dto },
      select: { id: true },
    });
    if (taken) {
      throw invalidField('number', `Bay ${dto.number} already exists there`);
    }
    return this.prisma.$transaction(async (tx) => {
      const bay = await tx.bay.create({
        data: { operatorId: ctx.operatorId, ...dto },
        select: { id: true, number: true, station: { select: stationSelect } },
      });
      await this.audit.record(
        tx,
        auditEntry(ctx, 'bay.create', 'Bay', bay.id, null, dto),
      );
      return bay;
    });
  }
}
