import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BusStatus, TripStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LayoutCell } from '../trips/trip-seats.js';
import {
  auditEntry,
  invalidField,
  notFound,
  type AdminContext,
} from './admin-context.js';
import { CreateBusDto, UpdateBusDto } from './dto/bus.dto.js';
import { LayoutDto } from './dto/layout.dto.js';
import { validateLayout } from './layout-validation.js';

/** Trips that still matter for a bus: not departed, not cancelled. */
const UPCOMING = [TripStatus.SCHEDULED, TripStatus.LOADING, TripStatus.FULL];

const layoutSelect = {
  id: true,
  name: true,
  rows: true,
  cols: true,
  cells: true,
  seatCount: true,
  version: true,
  _count: { select: { buses: true } },
} satisfies Prisma.SeatLayoutSelect;

/** Seat layouts and buses. */
@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Layouts ───────────────────────────────────────────────────────────────

  /** GET /admin/layouts: layouts in use, with how many buses use each. */
  async listLayouts(ctx: AdminContext) {
    const layouts = await this.prisma.seatLayout.findMany({
      where: { operatorId: ctx.operatorId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: layoutSelect,
    });
    return layouts.map(toLayout);
  }

  /** GET /admin/layouts/:id */
  async getLayout(ctx: AdminContext, id: string) {
    return toLayout(await this.findLayout(ctx, id));
  }

  /** POST /admin/layouts */
  async createLayout(ctx: AdminContext, dto: LayoutDto) {
    const seatCount = validateLayout(dto);
    await this.ensureNameFree(ctx, dto.name);
    return this.prisma.$transaction(async (tx) => {
      const layout = await tx.seatLayout.create({
        data: {
          operatorId: ctx.operatorId,
          name: dto.name.trim(),
          rows: dto.rows,
          cols: dto.cols,
          cells: dto.cells as unknown as Prisma.InputJsonValue,
          seatCount,
        },
        select: layoutSelect,
      });
      await this.audit.record(
        tx,
        auditEntry(ctx, 'layout.create', 'SeatLayout', layout.id, null, {
          name: layout.name,
          seatCount,
        }),
      );
      return toLayout(layout);
    });
  }

  /**
   * PUT /admin/layouts/:id. Trips keep the snapshot they were made with, so
   * editing in place is safe; when an upcoming trip came from this layout the
   * version goes up, so the audit trail shows which version each trip used.
   */
  async updateLayout(ctx: AdminContext, id: string, dto: LayoutDto) {
    const current = await this.findLayout(ctx, id);
    const seatCount = validateLayout(dto);
    if (dto.name.trim() !== current.name) {
      await this.ensureNameFree(ctx, dto.name);
    }
    const inUse = await this.prisma.trip.count({
      where: {
        bus: { layoutId: id },
        status: { in: [TripStatus.SCHEDULED, TripStatus.LOADING] },
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const layout = await tx.seatLayout.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          rows: dto.rows,
          cols: dto.cols,
          cells: dto.cells as unknown as Prisma.InputJsonValue,
          seatCount,
          version: inUse ? { increment: 1 } : undefined,
        },
        select: layoutSelect,
      });
      await this.audit.record(
        tx,
        auditEntry(
          ctx,
          'layout.update',
          'SeatLayout',
          id,
          { version: current.version, seatCount: current.seatCount },
          { version: layout.version, seatCount },
        ),
      );
      return toLayout(layout);
    });
  }

  /** POST /admin/layouts/:id/archive: only once no bus uses it. */
  async archiveLayout(ctx: AdminContext, id: string) {
    const layout = await this.findLayout(ctx, id);
    if (layout._count.buses) {
      throw new AppException(
        'LAYOUT_IN_USE',
        `${layout._count.buses} bus${layout._count.buses === 1 ? ' uses' : 'es use'} this layout`,
        HttpStatus.CONFLICT,
        { buses: layout._count.buses },
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.seatLayout.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await this.audit.record(
        tx,
        auditEntry(ctx, 'layout.archive', 'SeatLayout', id),
      );
    });
    return { id, archived: true };
  }

  // ─── Buses ─────────────────────────────────────────────────────────────────

  /** GET /admin/buses */
  async listBuses(ctx: AdminContext) {
    const buses = await this.prisma.bus.findMany({
      where: { operatorId: ctx.operatorId },
      orderBy: { plate: 'asc' },
      select: {
        id: true,
        plate: true,
        type: true,
        status: true,
        backInServiceOn: true,
        layout: { select: { id: true, name: true, seatCount: true } },
        trips: {
          where: { status: { in: UPCOMING } },
          orderBy: [
            { departureAt: { sort: 'asc', nulls: 'last' } },
            { loadingStartsAt: 'asc' },
          ],
          take: 1,
          select: {
            id: true,
            status: true,
            mode: true,
            departureAt: true,
            loadingStartsAt: true,
            bay: { select: { number: true } },
            route: {
              select: { destinationStation: { select: { city: true } } },
            },
          },
        },
      },
    });
    return buses.map(({ trips, ...bus }) => ({
      ...bus,
      nextTrip: trips[0] ?? null,
    }));
  }

  /** POST /admin/buses */
  async createBus(ctx: AdminContext, dto: CreateBusDto) {
    const plate = normalizePlate(dto.plate);
    await this.ensureLayoutUsable(ctx, dto.layoutId);
    if (await this.prisma.bus.findUnique({ where: { plate } })) {
      throw plateExists(plate);
    }
    return this.prisma.$transaction(async (tx) => {
      const bus = await tx.bus.create({
        data: {
          operatorId: ctx.operatorId,
          plate,
          type: dto.type,
          layoutId: dto.layoutId,
        },
      });
      await this.audit.record(
        tx,
        auditEntry(ctx, 'bus.create', 'Bus', bus.id, null, {
          plate,
          type: bus.type,
          layoutId: bus.layoutId,
        }),
      );
      return bus;
    });
  }

  /**
   * PATCH /admin/buses/:id. A new layout, or taking the bus off the road, is
   * refused while it has upcoming trips with sold seats (those passengers'
   * seat numbers would be wrong).
   */
  async updateBus(ctx: AdminContext, id: string, dto: UpdateBusDto) {
    const bus = await this.prisma.bus.findFirst({
      where: { id, operatorId: ctx.operatorId },
    });
    if (!bus) throw notFound('Bus');

    const newLayout = dto.layoutId && dto.layoutId !== bus.layoutId;
    const offRoad =
      dto.status &&
      dto.status !== BusStatus.ACTIVE &&
      bus.status === BusStatus.ACTIVE;
    if (newLayout) await this.ensureLayoutUsable(ctx, dto.layoutId!);
    if (newLayout || offRoad) {
      const sold = await this.prisma.trip.findMany({
        where: { busId: id, status: { in: UPCOMING }, seatsSold: { gt: 0 } },
        select: { id: true, departureAt: true, seatsSold: true },
      });
      if (sold.length) {
        throw new AppException(
          'BUS_HAS_BOOKINGS',
          `This bus has ${sold.length} upcoming trip${sold.length === 1 ? '' : 's'} with sold seats`,
          HttpStatus.CONFLICT,
          { trips: sold },
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bus.update({
        where: { id },
        data: {
          type: dto.type,
          layoutId: dto.layoutId,
          status: dto.status,
          backInServiceOn:
            dto.backInServiceOn === undefined
              ? undefined
              : dto.backInServiceOn &&
                new Date(`${dto.backInServiceOn}T00:00:00Z`),
        },
      });
      await this.audit.record(
        tx,
        auditEntry(
          ctx,
          'bus.update',
          'Bus',
          id,
          { type: bus.type, layoutId: bus.layoutId, status: bus.status },
          {
            type: updated.type,
            layoutId: updated.layoutId,
            status: updated.status,
          },
        ),
      );
      return updated;
    });
  }

  private async findLayout(ctx: AdminContext, id: string) {
    const layout = await this.prisma.seatLayout.findFirst({
      where: { id, operatorId: ctx.operatorId, archivedAt: null },
      select: layoutSelect,
    });
    if (!layout) throw notFound('Layout');
    return layout;
  }

  private async ensureNameFree(ctx: AdminContext, name: string) {
    const taken = await this.prisma.seatLayout.findFirst({
      where: {
        operatorId: ctx.operatorId,
        name: name.trim(),
        archivedAt: null,
      },
      select: { id: true },
    });
    if (taken) {
      throw invalidField('name', 'A layout with this name already exists');
    }
  }

  private async ensureLayoutUsable(ctx: AdminContext, layoutId: string) {
    const layout = await this.prisma.seatLayout.findFirst({
      where: { id: layoutId, operatorId: ctx.operatorId, archivedAt: null },
      select: { id: true },
    });
    if (!layout)
      throw invalidField('layoutId', 'Pick one of your seat layouts');
  }
}

function toLayout({
  _count,
  cells,
  ...layout
}: Prisma.SeatLayoutGetPayload<{ select: typeof layoutSelect }>) {
  return {
    ...layout,
    cells: cells as unknown as LayoutCell[],
    busesUsing: _count.buses,
  };
}

/** " gr 4471 - 24 " → "GR 4471-24" */
export function normalizePlate(plate: string): string {
  return plate
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
}

function plateExists(plate: string) {
  return new AppException(
    'PLATE_EXISTS',
    `A bus with plate ${plate} already exists`,
    HttpStatus.CONFLICT,
  );
}
