import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './fixtures.js';

// The other suites run with RATE_LIMITS=off; this one turns them on
describe('Rate limits (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    process.env.RATE_LIMITS = 'on';
  });

  afterAll(async () => {
    process.env.RATE_LIMITS = 'off';
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('allows 10 staff logins a minute from one address', async () => {
    const login = (n: number) =>
      http()
        .post('/api/v1/staff/auth/login')
        .send({
          email: `nobody-${n}@limits.test`,
          password: 'not-a-password',
          as: 'AGENT',
        });

    for (let n = 0; n < 10; n++) await login(n).expect(401);
    const blocked = await login(10).expect(429);
    expect(blocked.body.error).toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Try again in a minute.',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it("doesn't limit health checks", async () => {
    for (let n = 0; n < 120; n++) {
      await http().get('/api/v1/health').expect(200);
    }
  });
});
