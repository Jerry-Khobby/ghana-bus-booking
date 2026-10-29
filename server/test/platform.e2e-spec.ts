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
    method: 'get' | 'post' | 'patch',
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
