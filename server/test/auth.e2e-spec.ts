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

describe('Passenger accounts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mailer: Mailer;
  let fx: Fixture;
  /** The last sign-in code emailed to each address. */
  const codes = new Map<string, string>();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fx = await createFixture(prisma);
    mailer = app.get(MAILER);
    mailer.send = async (message) => {
      const code = /Your Seatline code: (\d{6})/.exec(message.subject)?.[1];
      if (code) codes.set(message.to, code);
    };
  });

  // Each test starts with no codes, so the rate limits never carry over
  afterEach(async () => {
    await prisma.otpCode.deleteMany({
      where: { email: { endsWith: `@${fx.suffix}.test` } },
    });
  });

  afterAll(async () => {
    const passengers = await prisma.passenger.findMany({
      where: { email: { endsWith: `@${fx.suffix}.test` } },
      select: { id: true },
    });
    const ids = passengers.map((p) => p.id);
    await prisma.refreshToken.deleteMany({ where: { subjectId: { in: ids } } });
    await prisma.outboundMessage.deleteMany({
      where: { to: { endsWith: `@${fx.suffix}.test` } },
    });
    await fx?.cleanup();
    await prisma.passenger.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const emailFor = (name: string) => `${name}@${fx.suffix}.test`;
  const requestCode = (email: string) =>
    http().post('/api/v1/auth/otp/request').send({ email });
  const verify = (email: string, code: string) =>
    http().post('/api/v1/auth/otp/verify').send({ email, code });
  const refreshCookie = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('sl_refresh='));

  /** Signs in and returns the access token and the refresh cookie. */
  async function signIn(email: string) {
    await requestCode(email).expect(202);
    const res = await verify(email, codes.get(email)!).expect(200);
    return {
      accessToken: res.body.accessToken as string,
      cookie: refreshCookie(res)!.split(';')[0],
      passenger: res.body.passenger,
    };
  }

  describe('sign in with an emailed code', () => {
    it('emails a code and wipes it from the outbox once sent', async () => {
      const email = emailFor('ama');
      const res = await requestCode(email.toUpperCase()).expect(202);

      expect(res.body).toEqual({
        expiresInSeconds: 600,
        resendAfterSeconds: 45,
      });
      expect(codes.get(email)).toMatch(/^\d{6}$/);

      const [message] = await prisma.outboundMessage.findMany({
        where: { to: email, template: 'otp' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(message).toMatchObject({
        status: 'SENT',
        subject: `Your Seatline code: ${codes.get(email)}`,
        body: '[removed after sending: it contained a secret]',
      });
      // Only a hash of the code is stored
      const otp = await prisma.otpCode.findFirstOrThrow({ where: { email } });
      expect(otp.codeHash).not.toContain(codes.get(email));
    });

    it('rejects a bad email address', async () => {
      const res = await requestCode('not-an-email').expect(400);
      expect(res.body.error.code).toBe('INVALID_EMAIL');
    });

    it('allows three codes per email per 15 minutes', async () => {
      const email = emailFor('kofi');
      for (let i = 0; i < 3; i++) await requestCode(email).expect(202);

      const res = await requestCode(email).expect(429);
      expect(res.body.error.code).toBe('OTP_RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(800);
    });

    it('signs in, sets the refresh cookie, and the code works once', async () => {
      const email = emailFor('efua');
      await requestCode(email).expect(202);

      const res = await verify(email, codes.get(email)!).expect(200);
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        passenger: { email, name: null, phone: null },
      });
      const cookie = refreshCookie(res)!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookie).toMatch(/SameSite=Lax/);

      const again = await verify(email, codes.get(email)!).expect(401);
      expect(again.body.error.code).toBe('OTP_EXPIRED');
    });

    it('counts wrong codes down and kills the code after five', async () => {
      const email = emailFor('yaw');
      await requestCode(email).expect(202);
      const right = codes.get(email)!;
      const wrong = right === '000000' ? '111111' : '000000';

      const first = await verify(email, wrong).expect(401);
      expect(first.body.error).toMatchObject({
        code: 'OTP_INVALID',
        details: { attemptsLeft: 4 },
      });
      for (let i = 0; i < 4; i++) await verify(email, wrong).expect(401);

      const dead = await verify(email, right).expect(401);
      expect(dead.body.error.code).toBe('OTP_EXPIRED');
    });
  });

  describe('sessions', () => {
    it('rotates the refresh token and spots a stolen one', async () => {
      const { cookie } = await signIn(emailFor('abena'));

      const refreshed = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      const rotated = refreshCookie(refreshed)!.split(';')[0];
      expect(rotated).not.toBe(cookie);

      // The old token again: someone copied it. The whole family dies.
      const replay = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
      expect(replay.body.error.code).toBe('REFRESH_REUSED');
      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotated)
        .expect(401);
    });

    it('signs out', async () => {
      const { cookie } = await signIn(emailFor('kojo'));
      await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('refuses a refresh with no cookie', async () => {
      const res = await http().post('/api/v1/auth/refresh').expect(401);
      expect(res.body.error.code).toBe('REFRESH_INVALID');
    });
  });

  describe('/me', () => {
    it('needs a passenger token', async () => {
      await http().get('/api/v1/me').expect(401);
      await http()
        .get('/api/v1/me')
        .set('Authorization', 'Bearer not-a-token')
        .expect(401);
    });

    it('reads and updates the profile', async () => {
      const { accessToken } = await signIn(emailFor('akua'));
      const auth = { Authorization: `Bearer ${accessToken}` };

      const updated = await http()
        .patch('/api/v1/me')
        .set(auth)
        .send({ name: 'Akua Darko', phone: '024 123 4567' })
        .expect(200);
      expect(updated.body).toMatchObject({
        name: 'Akua Darko',
        phone: '+233241234567',
      });

      const bad = await http()
        .patch('/api/v1/me')
        .set(auth)
        .send({ phone: '12345' })
        .expect(400);
      expect(bad.body.error.code).toBe('INVALID_PHONE');

      const me = await http().get('/api/v1/me').set(auth).expect(200);
      expect(me.body.name).toBe('Akua Darko');
    });
  });

  describe('My tickets', () => {
    /** Holds and pays for a seat as a guest (the fake provider pays 0000). */
    async function buyAsGuest(email: string, label: string) {
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
      });
      const hold = (
        await http()
          .post('/api/v1/holds')
          .send({ tripId: trip.id, seatLabel: label })
          .expect(201)
      ).body;
      const payment = (
        await http()
          .post(`/api/v1/holds/${hold.holdId}/pay`)
          .set('X-Hold-Token', hold.holdToken)
          .send({
            method: 'MOMO',
            phone: '0240000000',
            network: 'MTN',
            contactEmail: email,
          })
          .expect(201)
      ).body;
      const paid = await http()
        .post(`/api/v1/payments/${payment.paymentId}/verify`)
        .set('X-Hold-Token', hold.holdToken)
        .expect(200);
      return { trip, code: paid.body.bookingCode as string };
    }

    it('shows tickets bought as a guest once the passenger signs in', async () => {
      const email = emailFor('kwame');
      const { code } = await buyAsGuest(email, '1');

      const { accessToken } = await signIn(email);
      const auth = { Authorization: `Bearer ${accessToken}` };

      const upcoming = await http()
        .get('/api/v1/me/tickets')
        .set(auth)
        .expect(200);
      expect(upcoming.body).toMatchObject({
        items: [
          { code, status: 'CONFIRMED', badge: 'Scheduled', seatLabel: '1' },
        ],
        nextCursor: null,
      });
      const past = await http()
        .get('/api/v1/me/tickets')
        .query({ scope: 'past' })
        .set(auth)
        .expect(200);
      expect(past.body.items).toEqual([]);

      // Signed in, the ticket opens without the link
      await http().get(`/api/v1/tickets/${code}`).set(auth).expect(200);
    });

    it('pages with a cursor', async () => {
      const email = emailFor('esi');
      await buyAsGuest(email, '1');
      await buyAsGuest(email, '2');
      const { accessToken } = await signIn(email);
      const auth = { Authorization: `Bearer ${accessToken}` };

      const first = await http()
        .get('/api/v1/me/tickets')
        .query({ limit: 1 })
        .set(auth)
        .expect(200);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await http()
        .get('/api/v1/me/tickets')
        .query({ limit: 1, cursor: first.body.nextCursor })
        .set(auth)
        .expect(200);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.items[0].code).not.toBe(first.body.items[0].code);
      expect(second.body.nextCursor).toBeNull();
    });
  });

  describe('signed-in holds', () => {
    it('belong to the passenger, who needs no hold token', async () => {
      const owner = await signIn(emailFor('adwoa'));
      const other = await signIn(emailFor('kwesi'));
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
      });

      const hold = await http()
        .post('/api/v1/holds')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ tripId: trip.id, seatLabel: '3' })
        .expect(201);
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: hold.body.holdId },
      });
      expect(booking.passengerId).toBe(owner.passenger.id);

      await http()
        .get(`/api/v1/holds/${hold.body.holdId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      await http()
        .get(`/api/v1/holds/${hold.body.holdId}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });
});
