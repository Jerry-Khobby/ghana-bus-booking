import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';
import { openStream } from './sse.js';

const PASSWORD = 'mango-bay-42-sunrise';

// The fake provider (see vitest.config.e2e.ts): 0000 pays, 1111 declines
describe('Realtime streams (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;
  let base: string;
  let agentToken: string;
  const streams: { close: () => void }[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost') + '/api/v1';
    fx = await createFixture(prisma);
    const agent = await fx.createStaff({ password: PASSWORD, bayNumbers: [1] });
    agentToken = (
      await request(app.getHttpServer())
        .post('/api/v1/staff/auth/login')
        .send({ email: agent.email, password: PASSWORD, as: 'AGENT' })
        .expect(200)
    ).body.accessToken;
  });

  afterEach(() => streams.splice(0).forEach((s) => s.close()));

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const open = async (path: string, headers?: HeadersInit) => {
    const stream = await openStream(`${base}${path}`, headers);
    streams.push(stream);
    return stream;
  };
  const openTrip = () =>
    fx.createTrip({
      loadingStartsAt: minutesFromNow(60),
      departureAt: minutesFromNow(120),
    });
  const hold = async (tripId: string, seatLabel: string) =>
    (await http().post('/api/v1/holds').send({ tripId, seatLabel }).expect(201))
      .body as { holdId: string; holdToken: string };
  const pay = async (h: { holdId: string; holdToken: string }, phone: string) =>
    (
      await http()
        .post(`/api/v1/holds/${h.holdId}/pay`)
        .set('X-Hold-Token', h.holdToken)
        .send({
          method: 'MOMO',
          phone,
          network: 'MTN',
          contactEmail: `rt@${fx.suffix}.test`,
        })
        .expect(201)
    ).body as { paymentId: string };
  const verify = (paymentId: string, token: string) =>
    http()
      .post(`/api/v1/payments/${paymentId}/verify`)
      .set('X-Hold-Token', token)
      .expect(200);

  describe('GET /trips/:id/seats/stream', () => {
    it('shows seats turning held and free as other people act', async () => {
      const trip = await openTrip();
      const stream = await open(`/trips/${trip.id}/seats/stream`);
      expect(stream.status).toBe(200);
      expect(stream.contentType).toBe('text/event-stream');

      const someone = await hold(trip.id, '2');
      expect(await stream.next('seat')).toEqual({ label: '2', status: 'HELD' });

      await http()
        .delete(`/api/v1/holds/${someone.holdId}`)
        .set('X-Hold-Token', someone.holdToken)
        .expect(204);
      expect(await stream.next('seat')).toEqual({
        label: '2',
        status: 'AVAILABLE',
      });
    });

    it("shows the holder's own seat as MINE", async () => {
      const trip = await openTrip();
      const mine = await hold(trip.id, '1');
      const stream = await open(
        `/trips/${trip.id}/seats/stream?holdToken=${encodeURIComponent(mine.holdToken)}`,
      );

      // A declined payment hands the seat back to the holder
      const { paymentId } = await pay(mine, '0241111111');
      await verify(paymentId, mine.holdToken);
      expect(await stream.next('seat')).toEqual({ label: '1', status: 'MINE' });
    });

    it('turns a seat sold the moment it is paid for', async () => {
      const trip = await openTrip();
      const stream = await open(`/trips/${trip.id}/seats/stream`);
      const buyer = await hold(trip.id, '3');
      expect(await stream.next('seat')).toEqual({ label: '3', status: 'HELD' });

      const { paymentId } = await pay(buyer, '0240000000');
      await verify(paymentId, buyer.holdToken);
      expect(await stream.next('seat')).toEqual({ label: '3', status: 'SOLD' });
    });

    it('answers a missing trip with the usual error', async () => {
      const stream = await open(
        '/trips/0199f5b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b/seats/stream',
      );
      expect(stream.status).toBe(404);
      expect((await stream.json()).error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /payments/:id/stream', () => {
    it('sends the payment now and when it settles, then closes', async () => {
      const trip = await openTrip();
      const buyer = await hold(trip.id, '1');
      const { paymentId } = await pay(buyer, '0240000000');

      const stream = await open(
        `/payments/${paymentId}/stream?holdToken=${encodeURIComponent(buyer.holdToken)}`,
      );
      expect(await stream.next('payment')).toMatchObject({
        paymentId,
        status: 'PENDING',
        bookingCode: null,
      });

      await verify(paymentId, buyer.holdToken);
      expect(await stream.next('payment')).toMatchObject({
        status: 'SUCCESS',
        bookingStatus: 'CONFIRMED',
        bookingCode: expect.stringMatching(/^SL-/),
      });
      await stream.ended();
    });

    it("needs the payment's hold token", async () => {
      const trip = await openTrip();
      const buyer = await hold(trip.id, '2');
      const { paymentId } = await pay(buyer, '0241234567');

      expect((await open(`/payments/${paymentId}/stream`)).status).toBe(401);
      expect(
        (await open(`/payments/${paymentId}/stream?holdToken=wrong`)).status,
      ).toBe(404);
    });
  });

  describe('GET /agent/console/stream', () => {
    it('redraws the console as seats sell', async () => {
      const trip = await fx.createTrip({
        status: 'LOADING',
        loadingStartsAt: minutesFromNow(-10),
        departureAt: minutesFromNow(50),
      });
      const stream = await open(
        `/agent/console/stream?accessToken=${encodeURIComponent(agentToken)}`,
      );
      expect(stream.status).toBe(200);
      const first = await stream.next<{
        trip: { id: string };
        counts: { sold: number };
      }>('console');
      expect(first).toMatchObject({
        trip: { id: trip.id },
        counts: { sold: 0 },
      });

      await http()
        .post(`/api/v1/agent/trips/${trip.id}/walk-ins`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ method: 'CASH' })
        .expect(201);
      expect(await stream.next('console')).toMatchObject({
        counts: { sold: 1, walkIn: 1 },
      });
    });

    it('needs the access token', async () => {
      expect((await open('/agent/console/stream')).status).toBe(401);
      // Query tokens are for streams only: other routes still want the header
      await http()
        .get('/api/v1/agent/console')
        .query({ accessToken: agentToken })
        .expect(401);
    });
  });
});
