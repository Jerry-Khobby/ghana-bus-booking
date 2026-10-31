import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

// Needs the database: `npm run db:up` first.
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/api/v1/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('unknown routes return the standard error shape', () => {
    return request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', 'test-request-0001')
      .expect(404)
      .expect('X-Request-Id', 'test-request-0001')
      .expect({
        error: {
          code: 'NOT_FOUND',
          message: 'Cannot GET /api/v1/does-not-exist',
          details: {},
          requestId: 'test-request-0001',
        },
      });
  });

  it('refuses a body over the size limit with a 413, not a server error', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/holds')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(200_000) }))
      .expect(413);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'That request is too large.',
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
