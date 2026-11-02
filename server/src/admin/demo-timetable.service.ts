import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import {
  BusStatus,
  DepartureMode,
  OperatorStatus,
  StaffRole,
  StaffStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminTripsService } from './admin-trips.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One daily departure to a destination city, in Ghana time (UTC): a fixed
 * departure, or a bus that loads from one time and leaves when full.
 */
export interface DemoSlot {
  to: string;
  departs?: string;
  loads?: { from: string; leaveBy: string };
}

/** A day out of Accra on the seeded operator's four routes. */
export const DEMO_SLOTS: DemoSlot[] = [
  { to: 'Tamale', departs: '05:30' },
  { to: 'Kumasi', departs: '06:00' },
  { to: 'Cape Coast', departs: '07:00' },
  { to: 'Kumasi', loads: { from: '08:00', leaveBy: '11:00' } },
  { to: 'Takoradi', departs: '09:00' },
  { to: 'Kumasi', departs: '13:00' },
  { to: 'Cape Coast', departs: '15:00' },
];

/**
 * Keeps a demo operator's timetable stocked, so the live demo always has
 * buses to book. DEMO_TIMETABLE names the operator by slug; each tick adds
 * the slots above for today and the next few days that have no trip yet.
 * Trips go through the dashboard's own create, so buses, bays and layouts
 * are checked the same way, and a slot no bus is free for is skipped. A
 * slot with any trip, even a cancelled one, is the operator's: left alone.
 */
@Injectable()
export class DemoTimetableService {
  private readonly logger = new Logger(DemoTimetableService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: AdminTripsService,
  ) {}

  /** Returns how many trips it added. */
  async fill(
    slug: string,
    now = new Date(),
    slots = DEMO_SLOTS,
    daysAhead = 3,
  ): Promise<number> {
    const operator = await this.prisma.operator.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (operator?.status !== OperatorStatus.ACTIVE) return 0;
    const admin = await this.prisma.staffUser.findFirst({
      where: {
        operatorId: operator.id,
        role: StaffRole.OPERATOR_ADMIN,
        // Named as the trips' creator in the audit log
        status: { not: StaffStatus.DISABLED },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) return 0;
    const ctx = { operatorId: operator.id, staffId: admin.id };

    const [routes, buses, bays] = await Promise.all([
      this.prisma.route.findMany({
        where: { operatorId: operator.id, active: true },
        select: {
          id: true,
          originStationId: true,
          destinationStation: { select: { city: true } },
        },
      }),
      this.prisma.bus.findMany({
        where: { operatorId: operator.id, status: BusStatus.ACTIVE },
        orderBy: { plate: 'asc' },
        select: { id: true },
      }),
      this.prisma.bay.findMany({
        where: { operatorId: operator.id },
        orderBy: { number: 'asc' },
        select: { id: true, stationId: true },
      }),
    ]);

    const startOfToday = Date.parse(now.toISOString().slice(0, 10));
    let added = 0;
    for (let d = 0; d <= daysAhead; d++) {
      const day = new Date(startOfToday + d * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const at = (time: string) => new Date(`${day}T${time}:00Z`);

      for (const [i, slot] of slots.entries()) {
        const route = routes.find((r) => r.destinationStation.city === slot.to);
        const starts = at(slot.departs ?? slot.loads!.from);
        if (!route || starts <= now) continue;
        const taken = await this.prisma.trip.findFirst({
          where: slot.departs
            ? { routeId: route.id, departureAt: starts }
            : { routeId: route.id, loadingStartsAt: starts },
          select: { id: true },
        });
        if (taken) continue;
        // A bay of its own per slot, so buses loading together don't queue
        const atOrigin = bays.filter(
          (b) => b.stationId === route.originStationId,
        );
        if (!atOrigin.length) continue;

        const times = slot.departs
          ? {
              mode: DepartureMode.FIXED_TIME,
              departureAt: starts.toISOString(),
            }
          : {
              mode: DepartureMode.WHEN_FULL,
              loadingStartsAt: starts.toISOString(),
              leaveBy: at(slot.loads!.leaveBy).toISOString(),
            };
        for (const bus of buses) {
          try {
            await this.trips.create(ctx, {
              routeId: route.id,
              busId: bus.id,
              bayId: atOrigin[i % atOrigin.length].id,
              ...times,
            });
            added++;
            break;
          } catch (error) {
            // That bus is out on another trip: try the next one
            if (
              error instanceof AppException &&
              error.code === 'BUS_DOUBLE_BOOKED'
            ) {
              continue;
            }
            this.logger.warn(
              `Demo slot ${day} ${slot.to} skipped: ${(error as Error).message}`,
            );
            break;
          }
        }
      }
    }
    if (added) this.logger.log(`Demo timetable: added ${added} trips`);
    return added;
  }
}
