import { INestApplication } from '@nestjs/common';
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

describe('Operator admin: agents and cash (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;
  let other: Fixture;
  let admin: string;
  /** Emails the mailer was asked to send, by address. */
  const inbox = new Map<string, { subject: string; text: string }[]>();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const mailer: Mailer = app.get(MAILER);
    mailer.send = async (m) => {
      inbox.set(m.to, [...(inbox.get(m.to) ?? []), m]);
    };
    fx = await createFixture(prisma);
    other = await createFixture(prisma);
    const boss = await fx.createStaff({
      role: 'OPERATOR_ADMIN',
      password: PASSWORD,
    });
    admin = await login(boss.email, 'OPERATOR');
  });

  afterAll(async () => {
    await prisma.outboundMessage.deleteMany({
      where: { to: { endsWith: `@${fx.suffix}.test` } },
    });
    await fx?.cleanup();
    await other?.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  async function login(email: string, as = 'AGENT', password = PASSWORD) {
    return (
      await http()
        .post('/api/v1/staff/auth/login')
        .send({ email, password, as })
        .expect(200)
    ).body.accessToken as string;
  }
  const call = (method: 'get' | 'post' | 'patch', path: string) =>
    http()
      [method](`/api/v1/admin${path}`)
      .set('Authorization', `Bearer ${admin}`);
  /** The token in the newest email to this address. */
  const tokenFromEmail = (to: string) => {
    const mail = inbox.get(to)!.at(-1)!;
    return decodeURIComponent(/token=([^\s]+)/.exec(mail.text)![1]);
  };
  const invite = (name: string, bayNumbers = [1]) =>
    call('post', '/agents').send({
      name,
      email: `${name.toLowerCase()}@${fx.suffix}.test`,
      stationId: fx.origin.id,
      bayIds: bayNumbers.map((n) => fx.bays[n - 1].id),
    });

  describe('inviting agents', () => {
    it('emails a set-password link that signs the agent in', async () => {
      const res = await invite('Akosua', [1, 2]).expect(201);
      const email = `akosua@${fx.suffix}.test`;
      expect(res.body).toMatchObject({
        name: 'Akosua',
        email,
        status: 'INVITED',
        station: { id: fx.origin.id },
        bays: [{ number: 1 }, { number: 2 }],
        inviteUrl: expect.stringMatching(/\/staff\/accept\?token=/),
      });

      const mail = inbox.get(email)!.at(-1)!;
      expect(mail.subject).toBe(
        "You're invited to Seatline (link valid 7 days)",
      );
      expect(mail.text).toContain(fx.operator.name);

      // The link isn't kept once the email has gone
      const stored = await prisma.outboundMessage.findFirstOrThrow({
        where: { to: email, template: 'staff-invite' },
      });
      expect(stored.body).toBe(
        '[removed after sending: it contained a secret]',
      );

      await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token: tokenFromEmail(email), password: PASSWORD })
        .expect(200);
      await login(email);
    });

    it('refuses a used email and bays at another station', async () => {
      await invite('Esi').expect(201);
      const twice = await invite('Esi').expect(409);
      expect(twice.body.error.code).toBe('EMAIL_EXISTS');

      const elsewhere = await prisma.bay.create({
        data: {
          operatorId: fx.operator.id,
          stationId: fx.destination.id,
          number: 7,
        },
      });
      const res = await call('post', '/agents')
        .send({
          name: 'Kwame',
          email: `kwame@${fx.suffix}.test`,
          stationId: fx.origin.id,
          bayIds: [elsewhere.id],
        })
        .expect(400);
      expect(res.body.error.details.fields.bayIds).toBeDefined();
    });

    it('resends an invite, killing the old link', async () => {
      const agent = (await invite('Yaw').expect(201)).body;
      const email = `yaw@${fx.suffix}.test`;
      const oldToken = tokenFromEmail(email);

      await call('post', `/agents/${agent.id}/resend-invite`).expect(202);
      await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token: oldToken, password: PASSWORD })
        .expect(401);
      await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token: tokenFromEmail(email), password: PASSWORD })
        .expect(200);

      const again = await call(
        'post',
        `/agents/${agent.id}/resend-invite`,
      ).expect(409);
      expect(again.body.error.code).toBe('INVALID_STATE');
    });
  });

  describe('managing agents', () => {
    it('disabling signs the agent out; re-enabling lets them back', async () => {
      const kofi = await fx.createStaff({
        password: PASSWORD,
        bayNumbers: [1],
      });
      const session = await http()
        .post('/api/v1/staff/auth/login')
        .send({ email: kofi.email, password: PASSWORD, as: 'AGENT' })
        .expect(200);
      const cookie = ([] as string[])
        .concat(session.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('sl_refresh='))!
        .split(';')[0];

      const disabled = await call('patch', `/agents/${kofi.id}`)
        .send({ status: 'DISABLED' })
        .expect(200);
      expect(disabled.body.status).toBe('DISABLED');
      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
      await http()
        .post('/api/v1/staff/auth/login')
        .send({ email: kofi.email, password: PASSWORD, as: 'AGENT' })
        .expect(401);

      await call('patch', `/agents/${kofi.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await login(kofi.email);
    });

    it('moves an agent to other bays', async () => {
      const kofi = await fx.createStaff({
        password: PASSWORD,
        bayNumbers: [1],
      });
      const res = await call('patch', `/agents/${kofi.id}`)
        .send({ bayIds: [fx.bays[1].id] })
        .expect(200);
      expect(res.body.bays).toEqual([{ id: fx.bays[1].id, number: 2 }]);
    });

    it('emails a password reset link', async () => {
      const kofi = await fx.createStaff({ password: PASSWORD });
      const res = await call(
        'post',
        `/agents/${kofi.id}/reset-password`,
      ).expect(202);
      expect(res.body).toMatchObject({
        sent: true,
        resetUrl: expect.stringMatching(/\/staff\/reset\?token=/),
      });
      expect(inbox.get(kofi.email)!.at(-1)!.subject).toBe(
        'Reset your Seatline password (link valid 1 hour)',
      );

      await http()
        .post('/api/v1/staff/auth/reset-password')
        .send({
          token: tokenFromEmail(kofi.email),
          password: 'a-new-password-77',
        })
        .expect(200);
      await login(kofi.email, 'AGENT', 'a-new-password-77');
    });

    it("can't touch another operator's agents", async () => {
      const theirs = await other.createStaff({ password: PASSWORD });
      await call('patch', `/agents/${theirs.id}`)
        .send({ status: 'DISABLED' })
        .expect(404);
      const listed = (await call('get', '/agents').expect(200)).body;
      expect(listed.map((a: { id: string }) => a.id)).not.toContain(theirs.id);
    });
  });

  describe('cash', () => {
    it('groups unsettled cash by agent and marks it collected', async () => {
      const kofi = await fx.createStaff({
        password: PASSWORD,
        name: 'Kofi A.',
      });
      const trip = await fx.createTrip({
        status: 'LOADING',
        loadingStartsAt: minutesFromNow(-10),
        departureAt: minutesFromNow(50),
      });
      for (const label of ['1', '2']) {
        const booking = await fx.createBooking(trip.id, label, 'CONFIRMED');
        await prisma.cashEntry.create({
          data: {
            bookingId: booking.id,
            agentId: kofi.id,
            operatorId: fx.operator.id,
            amountPesewas: 5000,
          },
        });
      }

      const owed = await call('get', '/cash?status=unsettled').expect(200);
      expect(owed.body).toMatchObject([
        {
          agent: { id: kofi.id, name: 'Kofi A.' },
          tickets: 2,
          amountPesewas: 10_000,
        },
      ]);

      const settled = await call('post', '/cash/settle')
        .send({ agentId: kofi.id, upTo: new Date().toISOString() })
        .expect(200);
      expect(settled.body).toMatchObject({ settled: 2, amountPesewas: 10_000 });
      expect((await call('get', '/cash').expect(200)).body).toEqual([]);
      expect(
        await prisma.auditLog.count({
          where: { action: 'cash.settle', entityId: kofi.id },
        }),
      ).toBe(1);
    });
  });
});
