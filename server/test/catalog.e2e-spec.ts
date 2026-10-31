import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  isoDay,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

// Needs the database: `npm run db:up` first. The tests build their own
// operator and stations, so they don't depend on the seed.
describe('Catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;
  let suffix: string;
  const ids = {} as Record<
    'origin' | 'destination' | 'fixed' | 'whenFull' | 'cancelled',
    string
  >;

  // Trips are tomorrow so "now" never cuts into the test window.
  const tomorrow = isoDay(1);
  const at = (time: string, day = tomorrow) => new Date(`${day}T${time}:00Z`);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fx = await createFixture(prisma);
    suffix = fx.suffix;

    const fixed = await fx.createTrip({
      departureAt: at('10:00'),
      loadingStartsAt: at('09:00'),
    });
    // Seat 1 sold, 2 held but the hold ran out, 3 held right now, 4 free
    await fx.setSeat(fixed.id, '1', { status: 'SOLD' });
    await fx.setSeat(fixed.id, '2', {
      status: 'HELD',
      holdExpiresAt: minutesFromNow(-1),
    });
    await fx.setSeat(fixed.id, '3', {
      status: 'HELD',
      holdExpiresAt: minutesFromNow(5),
    });

    const whenFull = await fx.createTrip({
      mode: 'WHEN_FULL',
      status: 'LOADING',
      loadingStartsAt: at('08:00'),
      leaveBy: at('11:00'),
    });
    const cancelled = await fx.createTrip({
      departureAt: at('06:00'),
      status: 'CANCELLED',
    });
    // Neither of these should ever show up in tomorrow's search
    await fx.createTrip({ departureAt: at('12:00'), onlineBookingOpen: false });
    await fx.createTrip({ departureAt: at('10:00', isoDay(2)) });

    Object.assign(ids, {
      origin: fx.origin.id,
      destination: fx.destination.id,
      fixed: fixed.id,
      whenFull: whenFull.id,
      cancelled: cancelled.id,
    });
  });

  afterAll(async () => {
    await fx?.cleanup();
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

  describe('GET /trips/loading-now', () => {
    it('lists loading buses, then the next to leave today, with destinations', async () => {
      const soon = await fx.createTrip({
        loadingStartsAt: minutesFromNow(15),
        departureAt: minutesFromNow(30),
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/trips/loading-now')
        .query({ from: ids.origin })
        .expect(200);

      expect(res.body.map((t: { id: string }) => t.id)).toEqual([
        ids.whenFull,
        soon.id,
      ]);
      expect(res.body[0]).toMatchObject({
        status: 'LOADING',
        seatsLeft: 4,
        route: {
          origin: { id: ids.origin },
          destination: { id: ids.destination, name: 'South' },
        },
      });
    });

    it('leaves out buses whose departure time or leave-by deadline has passed', async () => {
      // Stored statuses that lag the clock: a bay that never freed up, and a
      // fill-and-go bus no agent departed
      const overdue = await fx.createTrip({
        loadingStartsAt: minutesFromNow(-90),
        departureAt: minutesFromNow(-5),
      });
      const pastLeaveBy = await fx.createTrip({
        mode: 'WHEN_FULL',
        status: 'LOADING',
        loadingStartsAt: minutesFromNow(-180),
        leaveBy: minutesFromNow(-10),
      });
      const gone = [overdue.id, pastLeaveBy.id];

      const loading = await request(app.getHttpServer())
        .get('/api/v1/trips/loading-now')
        .query({ from: ids.origin })
        .expect(200);
      const today = await search({ date: isoDay(0) }).expect(200);

      for (const res of [loading, today]) {
        const listed = res.body.map((t: { id: string }) => t.id);
        expect(listed.filter((id: string) => gone.includes(id))).toEqual([]);
      }
      await prisma.trip.updateMany({
        where: { id: { in: gone } },
        data: { status: 'DEPARTED' },
      });
    });

    it('rejects a station id that is not a uuid', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/trips/loading-now')
        .query({ from: 'circle' })
        .expect(400);
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
