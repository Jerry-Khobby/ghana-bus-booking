import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { StaffAuthService } from './../src/staff-auth/staff-auth.service.js';
import { createFixture, createTestApp, type Fixture } from './fixtures.js';

const PASSWORD = 'mango-bay-42-sunrise';

describe('Staff auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let fx: Fixture;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    staffAuth = app.get(StaffAuthService);
    fx = await createFixture(prisma);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string, as = 'AGENT') =>
    http().post('/api/v1/staff/auth/login').send({ email, password, as });
  const cookieOf = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('sl_refresh='))
      ?.split(';')[0];

  describe('POST /staff/auth/login', () => {
    it('signs an agent in to the agent console with their bays', async () => {
      const agent = await fx.createStaff({
        password: PASSWORD,
        bayNumbers: [1, 2],
        name: 'Kofi A.',
      });

      const res = await login(agent.email.toUpperCase(), PASSWORD).expect(200);
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        home: '/agent',
        staff: {
          id: agent.id,
          name: 'Kofi A.',
          role: 'AGENT',
          operator: { id: fx.operator.id, name: fx.operator.name },
          station: { id: fx.origin.id },
          bays: [{ number: 1 }, { number: 2 }],
        },
      });

      // The staff refresh token works through the shared refresh route
      const refreshed = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieOf(res)!)
        .expect(200);
      const me = await http()
        .get('/api/v1/staff/me')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(200);
      expect(me.body.id).toBe(agent.id);
    });

    it('keeps agents out of the admin side; admins pick either', async () => {
      const agent = await fx.createStaff({ password: PASSWORD });
      const admin = await fx.createStaff({
        role: 'OPERATOR_ADMIN',
        password: PASSWORD,
      });

      const denied = await login(agent.email, PASSWORD, 'OPERATOR').expect(403);
      expect(denied.body.error.code).toBe('ROLE_NOT_ALLOWED');

      expect(
        (await login(admin.email, PASSWORD, 'OPERATOR').expect(200)).body.home,
      ).toBe('/operator');
      expect(
        (await login(admin.email, PASSWORD, 'AGENT').expect(200)).body.home,
      ).toBe('/agent');
    });

    it('says the same thing for a wrong password and an unknown email', async () => {
      const agent = await fx.createStaff({ password: PASSWORD });

      const wrong = await login(agent.email, 'not-the-password').expect(401);
      const unknown = await login(`nobody@${fx.suffix}.test`, PASSWORD).expect(
        401,
      );
      expect(wrong.body.error).toEqual(unknown.body.error);
      expect(wrong.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is wrong',
      });
    });

    it('locks the account for 15 minutes after five failures', async () => {
      const agent = await fx.createStaff({ password: PASSWORD });
      for (let i = 0; i < 5; i++) {
        await login(agent.email, 'not-the-password').expect(401);
      }

      // Even the right password is refused while locked
      const locked = await login(agent.email, PASSWORD).expect(423);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(800);
    });

    it("doesn't let invited staff sign in before accepting", async () => {
      const invited = await fx.createStaff({});
      await login(invited.email, PASSWORD).expect(401);
    });
  });

  describe('invites and resets', () => {
    it('accepting an invite sets the password, once', async () => {
      const invited = await fx.createStaff({});
      const token = await staffAuth.issueToken(invited.id, 'INVITE');

      const weak = await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token, password: 'basketball' })
        .expect(400);
      expect(weak.body.error.code).toBe('WEAK_PASSWORD');

      const accepted = await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token, password: PASSWORD })
        .expect(200);
      expect(accepted.body).toMatchObject({
        accessToken: expect.any(String),
        home: '/agent',
      });
      expect(
        (
          await prisma.staffUser.findUniqueOrThrow({
            where: { id: invited.id },
          })
        ).status,
      ).toBe('ACTIVE');

      const again = await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token, password: PASSWORD })
        .expect(401);
      expect(again.body.error.code).toBe('TOKEN_INVALID');

      await login(invited.email, PASSWORD).expect(200);
    });

    it('a reset changes the password and signs out other sessions', async () => {
      const agent = await fx.createStaff({ password: PASSWORD });
      const before = await login(agent.email, PASSWORD).expect(200);
      const token = await staffAuth.issueToken(agent.id, 'PASSWORD_RESET');

      // An invite link can't be used as a reset, or the other way round
      await http()
        .post('/api/v1/staff/auth/accept-invite')
        .send({ token, password: 'another-good-pass-9' })
        .expect(401);

      await http()
        .post('/api/v1/staff/auth/reset-password')
        .send({ token, password: 'another-good-pass-9' })
        .expect(200);

      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieOf(before)!)
        .expect(401);
      await login(agent.email, PASSWORD).expect(401);
      await login(agent.email, 'another-good-pass-9').expect(200);
    });
  });

  describe('GET /staff/me', () => {
    it('is for staff only', async () => {
      await http().get('/api/v1/staff/me').expect(401);
    });
  });
});
