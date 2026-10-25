import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import type { LayoutCell } from './../src/trips/trip-seats.js';

// Needs the database: `npm run db:up` first. The tests build their own
// operator and stations, so they don't depend on the seed.
describe('Catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 8);
  const ids = {} as Record<
    'operator' | 'origin' | 'destination' | 'fixed' | 'whenFull' | 'cancelled',
    string
  >;

  // Trips are tomorrow so "now" never cuts into the test window.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const at = (time: string, day = tomorrow) => new Date(`${day}T${time}:00Z`);

  const cells: LayoutCell[] = [
    { r: 0, c: 0, type: 'SEAT', label: '1' },
    { r: 0, c: 1, type: 'AISLE' },
    { r: 0, c: 2, type: 'SEAT', label: '2' },
    { r: 1, c: 0, type: 'SEAT', label: '3' },
    { r: 1, c: 1, type: 'AISLE' },
    { r: 1, c: 2, type: 'SEAT', label: '4' },
  ];
  const seat = (label: string, row: number, col: number) => ({
    label,
    row,
    col,
  });
  const SEATS = [
    seat('1', 0, 0),
    seat('2', 0, 2),
    seat('3', 1, 0),
    seat('4', 1, 2),
  ];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);

    const operator = await prisma.operator.create({
      data: { name: `Test Lines ${suffix}`, slug: `test-${suffix}` },
    });
    const [origin, destination] = await Promise.all([
      prisma.station.create({
        data: { name: 'North', city: `Testville ${suffix}`, region: 'Test' },
      }),
      prisma.station.create({
        data: { name: 'South', city: `Testtown ${suffix}`, region: 'Test' },
      }),
    ]);
    const layout = await prisma.seatLayout.create({
      data: {
        operatorId: operator.id,
        name: 'Tiny',
        rows: 2,
        cols: 3,
        cells: cells as never,
        seatCount: 4,
      },
    });
    const bus = await prisma.bus.create({
      data: {
        operatorId: operator.id,
        plate: `TT ${suffix}`,
        type: 'MINIBUS',
        layoutId: layout.id,
      },
    });
    const bay = await prisma.bay.create({
      data: { operatorId: operator.id, stationId: origin.id, number: 1 },
    });
    const route = await prisma.route.create({
      data: {
        operatorId: operator.id,
        originStationId: origin.id,
        destinationStationId: destination.id,
        baseFarePesewas: 5000,
      },
    });
    const admin = await prisma.staffUser.create({
      data: {
        operatorId: operator.id,
        role: 'OPERATOR_ADMIN',
        email: `admin-${suffix}@test.example`,
        name: 'Test Admin',
      },
    });

    const trip = (data: Record<string, unknown>) =>
      prisma.trip.create({
        data: {
          operatorId: operator.id,
          routeId: route.id,
          busId: bus.id,
          bayId: bay.id,
          farePesewas: 5000,
          seatsTotal: 4,
          layoutSnapshot: { rows: 2, cols: 3, cells } as never,
          createdById: admin.id,
          mode: 'FIXED_TIME',
          ...data,
          seats: { create: SEATS },
        } as never,
      });

    const now = Date.now();
    const fixed = await trip({
      departureAt: at('10:00'),
      loadingStartsAt: at('09:00'),
    });
    // Seat 1 sold, 2 held but the hold ran out, 3 held right now, 4 free
    await prisma.tripSeat.updateMany({
      where: { tripId: fixed.id, label: '1' },
      data: { status: 'SOLD' },
    });
    await prisma.tripSeat.updateMany({
      where: { tripId: fixed.id, label: '2' },
      data: { status: 'HELD', holdExpiresAt: new Date(now - 60_000) },
    });
    await prisma.tripSeat.updateMany({
      where: { tripId: fixed.id, label: '3' },
      data: { status: 'HELD', holdExpiresAt: new Date(now + 5 * 60_000) },
    });

    const whenFull = await trip({
      mode: 'WHEN_FULL',
      status: 'LOADING',
      loadingStartsAt: at('08:00'),
      leaveBy: at('11:00'),
    });
    const cancelled = await trip({
      departureAt: at('06:00'),
      status: 'CANCELLED',
    });
    // Neither of these should ever show up in tomorrow's search
    await trip({ departureAt: at('12:00'), onlineBookingOpen: false });
    const dayAfter = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await trip({ departureAt: at('10:00', dayAfter) });

    Object.assign(ids, {
      operator: operator.id,
      origin: origin.id,
      destination: destination.id,
      fixed: fixed.id,
      whenFull: whenFull.id,
      cancelled: cancelled.id,
    });
  });

  afterAll(async () => {
    const operatorId = ids.operator;
    if (operatorId) {
      await prisma.trip.deleteMany({ where: { operatorId } }); // seats cascade
      await prisma.route.deleteMany({ where: { operatorId } });
      await prisma.bay.deleteMany({ where: { operatorId } });
      await prisma.bus.deleteMany({ where: { operatorId } });
      await prisma.seatLayout.deleteMany({ where: { operatorId } });
      await prisma.staffUser.deleteMany({ where: { operatorId } });
      await prisma.operator.delete({ where: { id: operatorId } });
      await prisma.station.deleteMany({
        where: { id: { in: [ids.origin, ids.destination] } },
      });
    }
    await app.close();
  });

  const search = (query: Record<string, string>) =>
    request(app.getHttpServer())
      .get('/api/v1/trips/search')
      .query({
        from: ids.origin,
        to: ids.destination,
        date: tomorrow,
        ...query,
      });

  describe('GET /stations', () => {
    it('matches city or name, case-insensitive', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stations')
        .query({ q: `TESTVILLE ${suffix}` })
        .expect(200);

      expect(res.body).toEqual([
        {
          id: ids.origin,
          name: 'North',
          city: `Testville ${suffix}`,
          region: 'Test',
        },
      ]);
    });
  });

  describe('GET /trips/search', () => {
    it('lists loading trips first and counts expired holds as free', async () => {
      const res = await search({}).expect(200);

      expect(
        res.body.map((t: { id: string; seatsLeft: number }) => [
          t.id,
          t.seatsLeft,
        ]),
      ).toEqual([
        [ids.whenFull, 4],
        [ids.fixed, 2], // seat 4, plus seat 2 whose hold ran out
      ]);
      expect(res.body[1]).toMatchObject({
        operator: { name: `Test Lines ${suffix}` },
        bus: { plate: `TT ${suffix}`, type: 'MINIBUS' },
        mode: 'FIXED_TIME',
        status: 'SCHEDULED',
        bay: { number: 1 },
        farePesewas: 5000,
        currency: 'GHS',
        seatsTotal: 4,
      });
    });

    it('filters by loadingNow, departAfter and busType', async () => {
      const loading = await search({ loadingNow: 'true' }).expect(200);
      expect(loading.body.map((t: { id: string }) => t.id)).toEqual([
        ids.whenFull,
      ]);

      const later = await search({ departAfter: '09:30' }).expect(200);
      expect(later.body.map((t: { id: string }) => t.id)).toEqual([ids.fixed]);

      const coaches = await search({ busType: 'AC_COACH' }).expect(200);
      expect(coaches.body).toEqual([]);
    });

    it('rejects the same station twice and past dates', async () => {
      const res = await search({ to: ids.origin, date: '2020-01-01' }).expect(
        400,
      );
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: {
          fields: {
            to: ['to must be a different station from from'],
            date: ['date cannot be in the past'],
          },
        },
      });
    });

    it('rejects malformed queries', async () => {
      const res = await search({
        date: 'tomorrow',
        loadingNow: 'maybe',
      }).expect(400);
      expect(Object.keys(res.body.error.details.fields).sort()).toEqual([
        'date',
        'loadingNow',
      ]);
    });
  });

  describe('GET /trips/:id', () => {
    it('includes the route stations and the service fee', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${ids.fixed}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: ids.fixed,
        seatsLeft: 2,
        operator: { serviceFeePesewas: 100 },
        route: {
          origin: { id: ids.origin, name: 'North' },
          destination: { id: ids.destination, name: 'South' },
        },
      });
    });

    it('hides cancelled trips', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${ids.cancelled}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects an id that is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trips/not-a-uuid')
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /trips/:id/seats', () => {
    it('merges seat statuses into the layout', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${ids.fixed}/seats`)
        .expect(200);

      expect(res.body).toEqual({
        rows: 2,
        cols: 3,
        cells: [
          { r: 0, c: 0, type: 'SEAT', label: '1', status: 'SOLD' },
          { r: 0, c: 1, type: 'AISLE' },
          { r: 0, c: 2, type: 'SEAT', label: '2', status: 'AVAILABLE' },
          { r: 1, c: 0, type: 'SEAT', label: '3', status: 'HELD' },
          { r: 1, c: 1, type: 'AISLE' },
          { r: 1, c: 2, type: 'SEAT', label: '4', status: 'AVAILABLE' },
        ],
      });
    });
  });
});
