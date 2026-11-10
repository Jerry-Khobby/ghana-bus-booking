import { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { MAILER, type Mailer } from './../src/messages/mailer.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

const PASSWORD = 'mango-bay-42-sunrise';

describe('Platform admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;
  let platformAdminId: string;
  let platform: string;
  let operatorAdmin: string;
  const created = { operators: [] as string[], stations: [] as string[] };
  const inbox = new Map<string, string>();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const mailer: Mailer = app.get(MAILER);
    mailer.send = async (m) => {
      inbox.set(m.to, m.text);
    };
    fx = await createFixture(prisma);

    const staff = await prisma.staffUser.create({
      data: {
        role: 'PLATFORM_ADMIN',
        email: `platform@${fx.suffix}.test`,
        name: 'Seatline Platform',
        passwordHash: await hash(PASSWORD),
        status: 'ACTIVE',
      },
    });
    platformAdminId = staff.id;
    platform = await login(staff.email, 'OPERATOR');
    const boss = await fx.createStaff({
      role: 'OPERATOR_ADMIN',
      password: PASSWORD,
    });
    operatorAdmin = await login(boss.email, 'OPERATOR');
  });

  afterAll(async () => {
    const operatorIds = created.operators;
    const staff = await prisma.staffUser.findMany({
      where: { operatorId: { in: operatorIds } },
      select: { id: true },
    });
    const staffIds = [...staff.map((s) => s.id), platformAdminId];
    await prisma.refreshToken.deleteMany({
      where: { subjectId: { in: staffIds } },
    });
    await prisma.staffToken.deleteMany({
      where: { staffUserId: { in: staffIds } },
    });
    await prisma.outboundMessage.deleteMany({
      where: { to: { endsWith: `@${fx.suffix}.test` } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ actorId: platformAdminId }, { operatorId: { in: operatorIds } }],
      },
    });
    await prisma.staffUser.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.operator.deleteMany({ where: { id: { in: operatorIds } } });
    await prisma.station.deleteMany({
      where: { id: { in: created.stations } },
    });
    await fx?.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  async function login(email: string, as: string) {
    return (
      await http()
        .post('/api/v1/staff/auth/login')
        .send({ email, password: PASSWORD, as })
        .expect(200)
    ).body.accessToken as string;
  }
  const call = (
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    token = platform,
  ) =>
    http()
      [method](`/api/v1/platform${path}`)
      .set('Authorization', `Bearer ${token}`);

  it('is for platform admins only', async () => {
    const res = await call('get', '/operators', operatorAdmin).expect(403);
    expect(res.body.error.code).toBe('ROLE_NOT_ALLOWED');
  });

  describe('operators', () => {
    it('creates an operator, refusing a slug already taken', async () => {
      const slug = `volta-star-${fx.suffix}`;
      const res = await call('post', '/operators')
        .send({
          name: 'Volta Star',
          slug,
          phone: '030 200 0000',
          email: 'Hello@VoltaStar.example',
          serviceFeePesewas: 150,
        })
        .expect(201);
      created.operators.push(res.body.id);
      expect(res.body).toMatchObject({
        name: 'Volta Star',
        slug,
        phone: '+233302000000',
        email: 'hello@voltastar.example',
        serviceFeePesewas: 150,
        holdMinutes: 5,
        status: 'ACTIVE',
        counts: { buses: 0, routes: 0, staff: 0 },
      });

      const twice = await call('post', '/operators')
        .send({ name: 'Another', slug })
        .expect(400);
      expect(twice.body.error.details.fields.slug).toBeDefined();

      const list = await call('get', '/operators').expect(200);
      expect(list.body.map((o: { id: string }) => o.id)).toContain(res.body.id);
    });

    it("invites an operator's first admin, who lands on the operator side", async () => {
      const operator = (
        await call('post', '/operators')
          .send({ name: 'Ashanti Link', slug: `ashanti-link-${fx.suffix}` })
          .expect(201)
      ).body;
      created.operators.push(operator.id);
      const email = `abena@${fx.suffix}.test`;

      const res = await call('post', `/operators/${operator.id}/admins`)
        .send({ name: 'Abena K.', email })
        .expect(201);
      expect(res.body).toMatchObject({
        role: 'OPERATOR_ADMIN',
        status: 'INVITED',
        operator: { id: operator.id, name: 'Ashanti Link' },
        inviteUrl: expect.stringMatching(/\/staff\/accept\?token=/),
      });
      expect(inbox.get(email)).toContain('Ashanti Link');

      const token = decodeURIComponent(
        /token=(\S+)/.exec(inbox.get(email)!)![1],
      );
      const accepted = await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token, password: PASSWORD })
        .expect(200);
      expect(accepted.body).toMatchObject({
        home: '/operator',
        staff: { role: 'OPERATOR_ADMIN', operator: { id: operator.id } },
      });

      const twice = await call('post', `/operators/${operator.id}/admins`)
        .send({ name: 'Abena K.', email })
        .expect(409);
      expect(twice.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('recovers an admin who is locked out', async () => {
      const operator = (
        await call('post', '/operators')
          .send({ name: 'Metro Mass', slug: `metro-mass-${fx.suffix}` })
          .expect(201)
      ).body;
      created.operators.push(operator.id);
      const email = `kweku@${fx.suffix}.test`;
      const admin = (
        await call('post', `/operators/${operator.id}/admins`)
          .send({ name: 'Kweku A.', email })
          .expect(201)
      ).body;
      const tokenIn = (url: string) =>
        decodeURIComponent(/token=([^&\s]+)/.exec(url)![1]);
      const firstInvite = tokenIn(admin.inviteUrl);

      // The invite link was lost: a new one replaces it
      const resent = await call('post', `/admins/${admin.id}/send-link`).expect(
        200,
      );
      expect(resent.body).toMatchObject({
        sent: 'INVITE',
        url: expect.stringMatching(/\/staff\/accept\?token=/),
      });
      await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token: firstInvite, password: PASSWORD })
        .expect(401);
      await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token: tokenIn(resent.body.url), password: PASSWORD })
        .expect(200);

      // Joined, then forgot the password: a reset link
      const reset = await call('post', `/admins/${admin.id}/send-link`).expect(
        200,
      );
      expect(reset.body).toMatchObject({
        sent: 'PASSWORD_RESET',
        url: expect.stringMatching(/\/staff\/reset\?token=/),
      });

      const admins = await call(
        'get',
        `/operators/${operator.id}/admins`,
      ).expect(200);
      expect(admins.body).toMatchObject([
        { id: admin.id, email, status: 'ACTIVE' },
      ]);
      // Operator admins can't use it on each other
      await call('post', `/admins/${admin.id}/send-link`, operatorAdmin).expect(
        403,
      );
    });

    it('suspending hides the operator from search and stops sales', async () => {
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
      });
      const search = () =>
        http()
          .get('/api/v1/trips/search')
          .query({
            from: fx.origin.id,
            to: fx.destination.id,
            date: trip.departureAt!.toISOString().slice(0, 10),
          })
          .expect(200);
      expect((await search()).body.map((t: { id: string }) => t.id)).toContain(
        trip.id,
      );

      await call('patch', `/operators/${fx.operator.id}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect((await search()).body).toEqual([]);
      const hold = await http()
        .post('/api/v1/holds')
        .send({ tripId: trip.id, seatLabel: '1' })
        .expect(409);
      expect(hold.body.error.code).toBe('TRIP_NOT_BOOKABLE');

      await call('patch', `/operators/${fx.operator.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect((await search()).body.map((t: { id: string }) => t.id)).toContain(
        trip.id,
      );
    });
  });

  describe('suspending and deleting', () => {
    // A company of its own, so suspending it leaves the other tests alone
    let co: Fixture;
    beforeAll(async () => {
      co = await createFixture(prisma);
    });
    afterAll(async () => {
      await co?.cleanup();
    });

    it("signs the company's staff out and keeps them out until it's reactivated", async () => {
      const agent = await co.createStaff({
        password: PASSWORD,
        bayNumbers: [1],
      });
      const boss = await co.createStaff({
        role: 'OPERATOR_ADMIN',
        password: PASSWORD,
      });
      const agentToken = await login(agent.email, 'AGENT');
      const signIn = await http()
        .post('/api/v1/staff/auth/login')
        .send({ email: boss.email, password: PASSWORD, as: 'OPERATOR' })
        .expect(200);
      const refreshCookie = ([] as string[])
        .concat(signIn.headers['set-cookie'] ?? [])
        .map((c) => c.split(';')[0]);
      const openConsole = () =>
        http()
          .get('/api/v1/agent/console')
          .set('Authorization', `Bearer ${agentToken}`);
      await openConsole().expect(200);

      await call('post', `/operators/${co.operator.id}/suspend`)
        .send({ cancelTrips: false })
        .expect(200);

      // The token they already hold stops working at once
      const refused = await openConsole().expect(403);
      expect(refused.body.error.code).toBe('OPERATOR_SUSPENDED');
      // Their session can't be renewed, and they can't sign in again
      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
      const again = await http()
        .post('/api/v1/staff/auth/login')
        .send({ email: agent.email, password: PASSWORD, as: 'AGENT' })
        .expect(403);
      expect(again.body.error.code).toBe('OPERATOR_SUSPENDED');
      // Only said to someone with the right password
      const wrong = await http()
        .post('/api/v1/staff/auth/login')
        .send({
          email: agent.email,
          password: 'not-the-password-1',
          as: 'AGENT',
        })
        .expect(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

      await call('patch', `/operators/${co.operator.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await login(agent.email, 'AGENT');
    });

    it('can cancel its upcoming trips, refunding tickets, and leaves past ones alone', async () => {
      const upcoming = await co.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
      });
      const ticket = await co.createBooking(upcoming.id, '1', 'CONFIRMED');
      // Due an hour ago but never marked departed: passengers travelled
      const past = await co.createTrip({
        bayId: co.bays[1].id,
        loadingStartsAt: minutesFromNow(-120),
        departureAt: minutesFromNow(-60),
      });
      const travelled = await co.createBooking(past.id, '1', 'CONFIRMED');

      const impact = await call(
        'get',
        `/operators/${co.operator.id}/impact`,
      ).expect(200);
      expect(impact.body).toMatchObject({
        upcomingTrips: 1,
        ticketsOnUpcomingTrips: 1,
        deletable: false,
      });

      const res = await call('post', `/operators/${co.operator.id}/suspend`)
        .send({ cancelTrips: true, reason: 'Licence withdrawn' })
        .expect(200);
      expect(res.body).toMatchObject({
        operator: { id: co.operator.id, status: 'SUSPENDED' },
        tripsCancelled: 1,
        refundsPending: 1,
        cashToRepay: [],
      });

      const after = await prisma.trip.findMany({
        where: { id: { in: [upcoming.id, past.id] } },
        select: { id: true, status: true, cancelReason: true },
      });
      expect(after).toEqual(
        expect.arrayContaining([
          {
            id: upcoming.id,
            status: 'CANCELLED',
            cancelReason: 'Licence withdrawn',
          },
          { id: past.id, status: 'SCHEDULED', cancelReason: null },
        ]),
      );
      const bookings = await prisma.booking.findMany({
        where: { id: { in: [ticket.id, travelled.id] } },
        select: { id: true, status: true },
      });
      expect(bookings).toEqual(
        expect.arrayContaining([
          { id: ticket.id, status: 'REFUND_PENDING' },
          { id: travelled.id, status: 'CONFIRMED' },
        ]),
      );

      // A company that sold seats is kept for the books
      const del = await call('delete', `/operators/${co.operator.id}`).expect(
        409,
      );
      expect(del.body.error.code).toBe('OPERATOR_HAS_SALES');
      expect(
        await prisma.operator.count({ where: { id: co.operator.id } }),
      ).toBe(1);
    });

    it('deletes a company that never sold a seat, with its fleet and staff', async () => {
      const operator = (
        await call('post', '/operators')
          .send({ name: 'Added By Mistake', slug: `mistake-${fx.suffix}` })
          .expect(201)
      ).body;
      created.operators.push(operator.id);
      const email = `mistake@${fx.suffix}.test`;
      const admin = (
        await call('post', `/operators/${operator.id}/admins`)
          .send({ name: 'Ama M.', email })
          .expect(201)
      ).body;
      // Set up as far as a trip, but nothing sold
      const layout = await prisma.seatLayout.create({
        data: {
          operatorId: operator.id,
          name: 'Tiny',
          rows: 1,
          cols: 1,
          cells: [{ r: 0, c: 0, type: 'SEAT', label: '1' }],
          seatCount: 1,
        },
      });
      const bus = await prisma.bus.create({
        data: {
          operatorId: operator.id,
          plate: `DEL ${fx.suffix}`,
          type: 'MINIBUS',
          layoutId: layout.id,
        },
      });
      const bay = await prisma.bay.create({
        data: { operatorId: operator.id, stationId: fx.origin.id, number: 1 },
      });
      const route = await prisma.route.create({
        data: {
          operatorId: operator.id,
          originStationId: fx.origin.id,
          destinationStationId: fx.destination.id,
          baseFarePesewas: 4000,
        },
      });
      await prisma.trip.create({
        data: {
          operatorId: operator.id,
          routeId: route.id,
          busId: bus.id,
          bayId: bay.id,
          mode: 'FIXED_TIME',
          departureAt: minutesFromNow(600),
          farePesewas: 4000,
          seatsTotal: 1,
          layoutSnapshot: { rows: 1, cols: 1, cells: [] },
          createdById: admin.id,
          seats: { create: [{ label: '1', row: 0, col: 0 }] },
        },
      });

      const impact = await call(
        'get',
        `/operators/${operator.id}/impact`,
      ).expect(200);
      expect(impact.body).toMatchObject({ bookings: 0, deletable: true });

      // Only the platform can delete
      await call('delete', `/operators/${operator.id}`, operatorAdmin).expect(
        403,
      );
      await call('delete', `/operators/${operator.id}`).expect(200, {
        deleted: true,
      });

      expect(await prisma.operator.count({ where: { id: operator.id } })).toBe(
        0,
      );
      expect(await prisma.staffUser.count({ where: { email } })).toBe(0);
      expect(await prisma.bus.count({ where: { id: bus.id } })).toBe(0);
      const log = await prisma.auditLog.findFirst({
        where: { action: 'operator.delete', entityId: operator.id },
      });
      expect(log?.before).toMatchObject({ name: 'Added By Mistake' });
      await call('delete', `/operators/${operator.id}`).expect(404);
    });
  });

  describe('stations', () => {
    it('adds stations once per city and name, and can take them off the pickers', async () => {
      const body = {
        name: 'Main station',
        city: `Ho ${fx.suffix}`,
        region: 'Volta',
      };
      const station = (await call('post', '/stations').send(body).expect(201))
        .body;
      created.stations.push(station.id);
      expect(station).toMatchObject({ ...body, active: true });

      const twice = await call('post', '/stations').send(body).expect(400);
      expect(twice.body.error.details.fields.name).toBeDefined();

      await call('patch', `/stations/${station.id}`)
        .send({ active: false })
        .expect(200);
      const picker = await http()
        .get('/api/v1/stations')
        .query({ q: `Ho ${fx.suffix}` })
        .expect(200);
      expect(picker.body).toEqual([]);

      const all = await call('get', '/stations').expect(200);
      expect(all.body).toContainEqual(
        expect.objectContaining({ id: station.id, active: false }),
      );
    });
  });
});
