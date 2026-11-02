import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  DemoTimetableService,
  type DemoSlot,
} from './../src/admin/demo-timetable.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  isoDay,
  type Fixture,
} from './fixtures.js';

// Needs the database: `npm run db:up` first.
describe('Demo timetable (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;
  let demo: DemoTimetableService;
  let slots: DemoSlot[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fx = await createFixture(prisma);
    demo = app.get(DemoTimetableService);
    // The fixture has one bus, so the 07:00 can't run: it's still out on the
    // 06:00 (4-hour default journey)
    slots = [
      { to: fx.destination.city, departs: '06:00' },
      { to: fx.destination.city, loads: { from: '12:00', leaveBy: '13:00' } },
      { to: fx.destination.city, departs: '07:00' },
    ];
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  const tripsOn = (day: string) =>
    prisma.trip.findMany({
      where: {
        routeId: fx.route.id,
        loadingStartsAt: {
          gte: new Date(`${day}T00:00:00Z`),
          lt: new Date(`${day}T23:59:59Z`),
        },
      },
      orderBy: { loadingStartsAt: 'asc' },
      select: {
        id: true,
        mode: true,
        departureAt: true,
        loadingStartsAt: true,
        leaveBy: true,
        bayId: true,
        _count: { select: { seats: true } },
      },
    });

  it('adds each day’s departures, skipping a slot no bus is free for', async () => {
    await demo.fill(fx.operator.slug, new Date(), slots, 2);

    for (const day of [isoDay(1), isoDay(2)]) {
      const trips = await tripsOn(day);
      expect(trips).toMatchObject([
        {
          mode: 'FIXED_TIME',
          departureAt: new Date(`${day}T06:00:00Z`),
          bayId: fx.bays[0].id,
          _count: { seats: 4 },
        },
        {
          mode: 'WHEN_FULL',
          loadingStartsAt: new Date(`${day}T12:00:00Z`),
          leaveBy: new Date(`${day}T13:00:00Z`),
          bayId: fx.bays[1].id,
        },
      ]);
    }
  });

  it('adds nothing twice, and leaves a slot the operator cancelled', async () => {
    // The 12:00: cancelling the 06:00 would free the bus for the 07:00
    const [, cancelled] = await tripsOn(isoDay(1));
    await prisma.trip.update({
      where: { id: cancelled.id },
      data: { status: 'CANCELLED' },
    });

    expect(await demo.fill(fx.operator.slug, new Date(), slots, 2)).toBe(0);
    expect(await tripsOn(isoDay(1))).toHaveLength(2);
  });

  it('does nothing for an operator that is not there', async () => {
    expect(await demo.fill('no-such-operator', new Date(), slots, 2)).toBe(0);
  });
});
