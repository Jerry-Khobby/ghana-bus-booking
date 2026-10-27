import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { hashHoldToken } from './../src/bookings/hold-token.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

describe('Holds (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fx = await createFixture(prisma);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  /** A bookable trip leaving in two hours, with four free seats. */
  const openTrip = () =>
    fx.createTrip({
      loadingStartsAt: minutesFromNow(60),
      departureAt: minutesFromNow(120),
    });

  const hold = (tripId: string, seatLabel: string, token?: string) => {
    const req = request(app.getHttpServer())
      .post('/api/v1/holds')
      .send({ tripId, seatLabel });
    return token ? req.set('X-Hold-Token', token) : req;
  };
  const getHold = (id: string, token: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/holds/${id}`)
      .set('X-Hold-Token', token);
  const release = (id: string, token: string) =>
    request(app.getHttpServer())
      .delete(`/api/v1/holds/${id}`)
      .set('X-Hold-Token', token);
  const seatMap = async (tripId: string, token?: string) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/trips/${tripId}/seats`,
    );
    const res = await (token ? req.set('X-Hold-Token', token) : req).expect(
      200,
    );
    return Object.fromEntries(
      res.body.cells
        .filter((c: { label?: string }) => c.label)
        .map((c: { label: string; status: string }) => [c.label, c.status]),
    );
  };

  describe('POST /holds', () => {
    it('holds a seat for the operator hold time and prices it', async () => {
      const trip = await openTrip();
      const res = await hold(trip.id, '1').expect(201);

      expect(res.body).toMatchObject({
        tripId: trip.id,
        seatLabel: '1',
        farePesewas: 5000,
        feePesewas: 100,
        totalPesewas: 5100,
        currency: 'GHS',
      });
      expect(res.body.holdToken).toEqual(expect.any(String));
      const secondsHeld =
        (new Date(res.body.expiresAt).getTime() - Date.now()) / 1000;
      expect(secondsHeld).toBeGreaterThan(290);
      expect(secondsHeld).toBeLessThanOrEqual(300);

      // Only the token's hash is stored
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: res.body.holdId },
      });
      expect(booking.status).toBe('HELD');
      expect(booking.holdTokenHash).toBe(hashHoldToken(res.body.holdToken));

      // Everyone sees HELD; the holder sees MINE
      expect((await seatMap(trip.id))['1']).toBe('HELD');
      expect((await seatMap(trip.id, res.body.holdToken))['1']).toBe('MINE');
    });

    it('refuses a seat someone else holds', async () => {
      const trip = await openTrip();
      await hold(trip.id, '2').expect(201);

      const res = await hold(trip.id, '2').expect(409);
      expect(res.body.error).toMatchObject({
        code: 'SEAT_TAKEN',
        message: 'Seat 2 was just taken. Pick another.',
      });
    });

    it('releases your old seat when you pick another on the same trip', async () => {
      const trip = await openTrip();
      const first = await hold(trip.id, '1').expect(201);
      const second = await hold(trip.id, '3', first.body.holdToken).expect(201);

      const old = await prisma.booking.findUniqueOrThrow({
        where: { id: first.body.holdId },
      });
      expect(old.status).toBe('CANCELLED');
      expect(await seatMap(trip.id, second.body.holdToken)).toMatchObject({
        '1': 'AVAILABLE',
        '3': 'MINE',
      });
    });

    it('lets someone take a seat once its hold ran out', async () => {
      const trip = await openTrip();
      const first = await hold(trip.id, '4').expect(201);
      await prisma.tripSeat.updateMany({
        where: { tripId: trip.id, label: '4' },
        data: { holdExpiresAt: minutesFromNow(-1) },
      });

      await hold(trip.id, '4').expect(201);
      const old = await prisma.booking.findUniqueOrThrow({
        where: { id: first.body.holdId },
      });
      expect(old.status).toBe('EXPIRED');
    });

    it('refuses trips that are departed, closed online or missing', async () => {
      const departed = await fx.createTrip({
        status: 'DEPARTED',
        departureAt: minutesFromNow(-60),
      });
      const closed = await fx.createTrip({
        departureAt: minutesFromNow(120),
        onlineBookingOpen: false,
      });

      // Still SCHEDULED (its bay never freed up) but its time has passed
      const overdue = await fx.createTrip({
        loadingStartsAt: minutesFromNow(-90),
        departureAt: minutesFromNow(-5),
      });

      for (const trip of [departed, closed, overdue]) {
        const res = await hold(trip.id, '1').expect(409);
        expect(res.body.error.code).toBe('TRIP_NOT_BOOKABLE');
      }
      const missing = await hold(
        '0199f5b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b',
        '1',
      ).expect(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects unknown seats and bad bodies', async () => {
      const trip = await openTrip();
      const seat = await hold(trip.id, '99').expect(404);
      expect(seat.body.error.code).toBe('SEAT_NOT_FOUND');

      const bad = await request(app.getHttpServer())
        .post('/api/v1/holds')
        .send({ tripId: 'nope', seatLabel: '' })
        .expect(400);
      expect(Object.keys(bad.body.error.details.fields).sort()).toEqual([
        'seatLabel',
        'tripId',
      ]);
    });

    it('gives a contested seat to exactly one of 50 people', async () => {
      const trip = await openTrip();

      const results = await Promise.all(
        Array.from({ length: 50 }, () => hold(trip.id, '1')),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(49);
      expect(
        results
          .filter((r) => r.status === 409)
          .every((r) => r.body.error.code === 'SEAT_TAKEN'),
      ).toBe(true);

      // Losers' bookings were rolled back with their transactions
      expect(
        await prisma.booking.count({
          where: { tripId: trip.id, seatLabel: '1' },
        }),
      ).toBe(1);
    }, 60_000);
  });

  describe('GET /holds/:id', () => {
    it('returns the summary and how long the seat stays held', async () => {
      const trip = await openTrip();
      const { body } = await hold(trip.id, '2').expect(201);

      const res = await getHold(body.holdId, body.holdToken).expect(200);
      expect(res.body).toMatchObject({
        holdId: body.holdId,
        status: 'HELD',
        seatLabel: '2',
        totalPesewas: 5100,
        trip: {
          id: trip.id,
          bus: { plate: fx.bus.plate },
          origin: { name: 'North' },
          destination: { name: 'South' },
        },
      });
      expect(res.body.secondsLeft).toBeGreaterThan(290);
      expect(res.body.secondsLeft).toBeLessThanOrEqual(300);
    });

    it('shows EXPIRED once the hold runs out', async () => {
      const trip = await openTrip();
      const { body } = await hold(trip.id, '3').expect(201);
      await prisma.tripSeat.updateMany({
        where: { tripId: trip.id, label: '3' },
        data: { holdExpiresAt: minutesFromNow(-1) },
      });

      const res = await getHold(body.holdId, body.holdToken).expect(200);
      expect(res.body).toMatchObject({ status: 'EXPIRED', secondsLeft: 0 });
      expect((await seatMap(trip.id))['3']).toBe('AVAILABLE');
    });

    it('needs the right hold token', async () => {
      const trip = await openTrip();
      const { body } = await hold(trip.id, '4').expect(201);

      const missing = await request(app.getHttpServer())
        .get(`/api/v1/holds/${body.holdId}`)
        .expect(401);
      expect(missing.body.error.code).toBe('UNAUTHENTICATED');

      const wrong = await getHold(body.holdId, 'not-the-token').expect(404);
      expect(wrong.body.error.code).toBe('NOT_FOUND');

      const badId = await getHold('nope', body.holdToken).expect(400);
      expect(badId.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('DELETE /holds/:id', () => {
    it('cancels the hold and frees the seat', async () => {
      const trip = await openTrip();
      const { body } = await hold(trip.id, '1').expect(201);

      await release(body.holdId, body.holdToken).expect(204);

      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: body.holdId },
      });
      expect(booking.status).toBe('CANCELLED');
      expect(booking.cancelledAt).not.toBeNull();
      expect((await seatMap(trip.id))['1']).toBe('AVAILABLE');

      // A second release has nothing to release
      const again = await release(body.holdId, body.holdToken).expect(409);
      expect(again.body.error.code).toBe('INVALID_STATE');
    });

    it('refuses while a payment is in progress', async () => {
      const trip = await openTrip();
      const { body } = await hold(trip.id, '2').expect(201);
      await prisma.booking.update({
        where: { id: body.holdId },
        data: { status: 'PENDING_PAYMENT' },
      });

      const res = await release(body.holdId, body.holdToken).expect(409);
      expect(res.body.error.code).toBe('PAYMENT_IN_PROGRESS');
    });

    it('says when the hold already ran out', async () => {
      const trip = await openTrip();
      const { body } = await hold(trip.id, '3').expect(201);
      await prisma.tripSeat.updateMany({
        where: { tripId: trip.id, label: '3' },
        data: { holdExpiresAt: minutesFromNow(-1) },
      });

      const res = await release(body.holdId, body.holdToken).expect(409);
      expect(res.body.error.code).toBe('HOLD_EXPIRED');
    });
  });
});
