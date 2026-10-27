import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service.js';
import type { LayoutCell } from './../src/trips/trip-seats.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

const PASSWORD = 'mango-bay-42-sunrise';

const minibus: LayoutCell[] = [
  { r: 0, c: 0, type: 'DRIVER' },
  { r: 0, c: 2, type: 'DOOR' },
  { r: 1, c: 0, type: 'SEAT', label: '1' },
  { r: 1, c: 1, type: 'AISLE' },
  { r: 1, c: 2, type: 'SEAT', label: '2' },
];

describe('Operator admin: fleet and network (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;
  let other: Fixture; // another operator, whose rows must stay invisible
  let admin: string;
  let agent: string;
  let tamale: { id: string };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fx = await createFixture(prisma);
    other = await createFixture(prisma);
    tamale = await prisma.station.create({
      data: {
        name: 'Main station',
        city: `Tamale ${fx.suffix}`,
        region: 'Test',
      },
    });

    const login = async (email: string, as: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/v1/staff/auth/login')
          .send({ email, password: PASSWORD, as })
          .expect(200)
      ).body.accessToken as string;
    const boss = await fx.createStaff({
      role: 'OPERATOR_ADMIN',
      password: PASSWORD,
    });
    const kofi = await fx.createStaff({ password: PASSWORD, bayNumbers: [1] });
    admin = await login(boss.email, 'OPERATOR');
    agent = await login(kofi.email, 'AGENT');
  });

  afterAll(async () => {
    await fx?.cleanup();
    await other?.cleanup();
    await prisma.station.deleteMany({ where: { id: tamale?.id } });
    await app.close();
  });

  const call = (method: 'get' | 'post' | 'put' | 'patch', path: string) =>
    request(app.getHttpServer())
      [method](`/api/v1/admin${path}`)
      .set('Authorization', `Bearer ${admin}`);
  const audits = (action: string, entityId: string) =>
    prisma.auditLog.findMany({ where: { action, entityId } });

  it('is for operator admins only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/buses')
      .set('Authorization', `Bearer ${agent}`)
      .expect(403);
    expect(res.body.error.code).toBe('ROLE_NOT_ALLOWED');
  });

  describe('seat layouts', () => {
    it('creates a valid layout, counting its seats', async () => {
      const res = await call('post', '/layouts')
        .send({ name: 'Minibus 1+1', rows: 2, cols: 3, cells: minibus })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Minibus 1+1',
        seatCount: 2,
        version: 1,
        busesUsing: 0,
      });
      expect(await audits('layout.create', res.body.id)).toHaveLength(1);
    });

    it('explains everything wrong with a bad layout', async () => {
      const res = await call('post', '/layouts')
        .send({
          name: 'Broken',
          rows: 2,
          cols: 3,
          cells: [{ r: 1, c: 0, type: 'SEAT' }],
        })
        .expect(400);
      expect(res.body.error.details.fields.cells).toEqual([
        'The seat at row 1, col 0 has no label',
        'A layout needs exactly one driver cell',
      ]);
    });

    it('bumps the version when an upcoming trip used it, and archives only unused layouts', async () => {
      // The fixture's bus uses its layout and has an upcoming trip
      await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
      });
      const [used] = (await call('get', '/layouts').expect(200)).body.filter(
        (l: { name: string }) => l.name === 'Tiny',
      );
      expect(used.busesUsing).toBe(1);

      const edited = await call('put', `/layouts/${used.id}`)
        .send({ name: 'Tiny', rows: 2, cols: 3, cells: minibus })
        .expect(200);
      expect(edited.body).toMatchObject({
        version: used.version + 1,
        seatCount: 2,
      });

      const refused = await call('post', `/layouts/${used.id}/archive`).expect(
        409,
      );
      expect(refused.body.error.code).toBe('LAYOUT_IN_USE');

      const spare = await call('post', '/layouts')
        .send({ name: 'Spare', rows: 2, cols: 3, cells: minibus })
        .expect(201);
      await call('post', `/layouts/${spare.body.id}/archive`).expect(200);
      const names = (await call('get', '/layouts').expect(200)).body.map(
        (l: { name: string }) => l.name,
      );
      expect(names).not.toContain('Spare');
    });
  });

  describe('buses', () => {
    it('stores plates uppercase and refuses duplicates', async () => {
      const res = await call('post', '/buses')
        .send({
          plate: ` gr ${fx.suffix.slice(0, 4)} - 26 `,
          type: 'MINIBUS',
          layoutId: fx.bus.layoutId,
        })
        .expect(201);
      expect(res.body.plate).toBe(
        `GR ${fx.suffix.slice(0, 4).toUpperCase()}-26`,
      );

      const again = await call('post', '/buses')
        .send({
          plate: res.body.plate,
          type: 'MINIBUS',
          layoutId: fx.bus.layoutId,
        })
        .expect(409);
      expect(again.body.error.code).toBe('PLATE_EXISTS');
    });

    it("won't use another operator's layout", async () => {
      const res = await call('post', '/buses')
        .send({
          plate: `XX ${fx.suffix}`,
          type: 'MINIBUS',
          layoutId: other.bus.layoutId,
        })
        .expect(400);
      expect(res.body.error.details.fields.layoutId).toBeDefined();
    });

    it('keeps a bus with sold upcoming seats on the road', async () => {
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
        seatsSold: 2,
      });
      const res = await call('patch', `/buses/${fx.bus.id}`)
        .send({ status: 'IN_WORKSHOP' })
        .expect(409);
      expect(res.body.error).toMatchObject({
        code: 'BUS_HAS_BOOKINGS',
        details: {
          trips: expect.arrayContaining([
            expect.objectContaining({ id: trip.id }),
          ]),
        },
      });
    });

    it('lists buses with their next trip, and hides other operators', async () => {
      const res = await call('get', '/buses').expect(200);
      const bus = res.body.find((b: { id: string }) => b.id === fx.bus.id);
      expect(bus).toMatchObject({
        layout: { id: fx.bus.layoutId },
        nextTrip: { status: 'SCHEDULED' },
      });
      expect(res.body.map((b: { id: string }) => b.id)).not.toContain(
        other.bus.id,
      );

      await call('patch', `/buses/${other.bus.id}`)
        .send({ type: 'STANDARD' })
        .expect(404);
    });
  });

  describe('routes, fares and bays', () => {
    it('adds a route once and refuses circles', async () => {
      const body = {
        originStationId: fx.origin.id,
        destinationStationId: tamale.id,
        baseFarePesewas: 28_000,
        durationMinutes: 720,
      };
      const res = await call('post', '/routes').send(body).expect(201);
      expect(res.body).toMatchObject({ baseFarePesewas: 28_000, active: true });

      const twice = await call('post', '/routes').send(body).expect(409);
      expect(twice.body.error.code).toBe('ROUTE_EXISTS');

      const circle = await call('post', '/routes')
        .send({ ...body, destinationStationId: fx.origin.id })
        .expect(400);
      expect(
        circle.body.error.details.fields.destinationStationId,
      ).toBeDefined();
    });

    it('changes fares together, keeping trips already made at their price', async () => {
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
      });
      const res = await call('patch', '/routes/fares')
        .send({ fares: [{ routeId: fx.route.id, baseFarePesewas: 6_500 }] })
        .expect(200);
      expect(
        res.body.find((r: { id: string }) => r.id === fx.route.id),
      ).toMatchObject({
        baseFarePesewas: 6_500,
        tripsToday: expect.any(Number),
      });

      expect(
        (await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } }))
          .farePesewas,
      ).toBe(5000);
      expect(await audits('route.fare', fx.route.id)).toMatchObject([
        {
          before: { baseFarePesewas: 5000 },
          after: { baseFarePesewas: 6_500 },
        },
      ]);

      // Fare changes can't touch another operator's routes
      await call('patch', '/routes/fares')
        .send({ fares: [{ routeId: other.route.id, baseFarePesewas: 1 }] })
        .expect(404);
    });

    it('takes a route off sale', async () => {
      const res = await call('patch', `/routes/${fx.route.id}`)
        .send({ active: false })
        .expect(200);
      expect(res.body.active).toBe(false);
      await call('patch', `/routes/${fx.route.id}`)
        .send({ active: true })
        .expect(200);
    });

    it('adds bays, one number per station', async () => {
      const res = await call('post', '/bays')
        .send({ stationId: fx.origin.id, number: 9 })
        .expect(201);
      expect(res.body).toMatchObject({
        number: 9,
        station: { id: fx.origin.id },
      });

      const twice = await call('post', '/bays')
        .send({ stationId: fx.origin.id, number: 9 })
        .expect(400);
      expect(twice.body.error.details.fields.number).toBeDefined();

      const listed = await call(
        'get',
        `/bays?stationId=${fx.origin.id}`,
      ).expect(200);
      expect(listed.body.map((b: { number: number }) => b.number)).toEqual([
        1, 2, 9,
      ]);
    });
  });
});
