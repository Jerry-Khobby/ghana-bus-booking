import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PaymentsService } from './../src/payments/payments.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

// Runs on the fake provider (see vitest.config.e2e.ts): numbers ending in
// 0000 are paid, 1111 are declined, anything else stays pending.
const PAYS = '0240000000';
const DECLINES = '0241111111';
const WAITS = '0241234567';

describe('Payments (e2e)', () => {
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

  const http = () => request(app.getHttpServer());

  /** Holds a seat on a fresh trip; returns the hold and the trip. */
  async function holdSeat(label = '1', trip?: { id: string }) {
    trip ??= await fx.createTrip({
      loadingStartsAt: minutesFromNow(60),
      departureAt: minutesFromNow(120),
    });
    const res = await http()
      .post('/api/v1/holds')
      .send({ tripId: trip.id, seatLabel: label })
      .expect(201);
    return { trip, hold: res.body as { holdId: string; holdToken: string } };
  }

  const pay = (
    hold: { holdId: string; holdToken: string },
    body: Record<string, unknown> = {},
    key?: string,
  ) => {
    const req = http()
      .post(`/api/v1/holds/${hold.holdId}/pay`)
      .set('X-Hold-Token', hold.holdToken)
      .send({
        method: 'MOMO',
        phone: PAYS,
        network: 'MTN',
        contactEmail: 'Ama@Example.com',
        passengerName: 'Ama Mensah',
        ...body,
      });
    return key ? req.set('Idempotency-Key', key) : req;
  };
  const verify = (paymentId: string, token: string) =>
    http()
      .post(`/api/v1/payments/${paymentId}/verify`)
      .set('X-Hold-Token', token);
  const poll = (paymentId: string, token: string) =>
    http().get(`/api/v1/payments/${paymentId}`).set('X-Hold-Token', token);
  const booking = (id: string) =>
    prisma.booking.findUniqueOrThrow({ where: { id } });
  const seat = (tripId: string, label: string) =>
    prisma.tripSeat.findFirstOrThrow({ where: { tripId, label } });

  describe('POST /holds/:id/pay', () => {
    it('sends the prompt and confirms the seat once paid', async () => {
      const { trip, hold } = await holdSeat();

      const started = await pay(hold).expect(201);
      expect(started.body).toMatchObject({
        status: 'PENDING',
        method: 'MOMO',
        amountPesewas: 5100,
        displayText: 'We sent a prompt to 024 *** 0000 (MTN)',
        bookingStatus: 'PENDING_PAYMENT',
        bookingCode: null,
      });
      const pending = await booking(hold.holdId);
      expect(pending).toMatchObject({
        status: 'PENDING_PAYMENT',
        contactEmail: 'ama@example.com',
        contactPhone: '+233240000000',
        passengerName: 'Ama Mensah',
      });

      const paid = await verify(started.body.paymentId, hold.holdToken).expect(
        200,
      );
      expect(paid.body).toMatchObject({
        status: 'SUCCESS',
        bookingStatus: 'CONFIRMED',
        bookingCode: pending.code,
      });
      expect(await seat(trip.id, '1')).toMatchObject({
        status: 'SOLD',
        bookingId: hold.holdId,
      });
      const after = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
      });
      expect(after.seatsSold).toBe(1);
    });

    it('keeps the seat held after a decline so the passenger can retry', async () => {
      const { trip, hold } = await holdSeat();

      const started = await pay(hold, { phone: DECLINES }).expect(201);
      const failed = await verify(
        started.body.paymentId,
        hold.holdToken,
      ).expect(200);
      expect(failed.body).toMatchObject({
        status: 'FAILED',
        failureCode: 'INSUFFICIENT_FUNDS',
        failureMessage: 'Not enough money in the wallet',
        bookingStatus: 'HELD',
      });
      expect((await seat(trip.id, '1')).status).toBe('HELD');

      // Second try with a number that pays
      const retry = await pay(hold).expect(201);
      expect(retry.body.paymentId).not.toBe(started.body.paymentId);
      await verify(retry.body.paymentId, hold.holdToken).expect(200);
      expect((await booking(hold.holdId)).status).toBe('CONFIRMED');
    });

    it('extends a nearly expired hold to three minutes while paying', async () => {
      const { trip, hold } = await holdSeat();
      await prisma.booking.update({
        where: { id: hold.holdId },
        data: { holdExpiresAt: minutesFromNow(1) },
      });
      await prisma.tripSeat.updateMany({
        where: { bookingId: hold.holdId },
        data: { holdExpiresAt: minutesFromNow(1) },
      });

      await pay(hold, { phone: WAITS }).expect(201);
      const left =
        ((await booking(hold.holdId)).holdExpiresAt!.getTime() - Date.now()) /
        1000;
      expect(left).toBeGreaterThan(170);
      expect(
        (await seat(trip.id, '1')).holdExpiresAt!.getTime(),
      ).toBeGreaterThan(Date.now() + 170_000);
    });

    it('returns the same payment for a second tap while it is pending', async () => {
      const { hold } = await holdSeat();
      const first = await pay(hold, { phone: WAITS }).expect(201);
      const second = await pay(hold, { phone: WAITS }).expect(201);

      expect(second.body.paymentId).toBe(first.body.paymentId);
      expect(
        await prisma.payment.count({ where: { bookingId: hold.holdId } }),
      ).toBe(1);
    });

    it('hands back the paid payment if the reply was lost and the passenger pays again', async () => {
      const { hold } = await holdSeat();
      const first = await pay(hold).expect(201);
      await verify(first.body.paymentId, hold.holdToken).expect(200);

      const again = await pay(hold).expect(201);
      expect(again.body).toMatchObject({
        paymentId: first.body.paymentId,
        status: 'SUCCESS',
        tickets: [{ seatLabel: '1' }],
      });
      // The hold names its latest payment, for a screen picking up the pieces
      const summary = await http()
        .get(`/api/v1/holds/${hold.holdId}`)
        .set('X-Hold-Token', hold.holdToken)
        .expect(200);
      expect(summary.body).toMatchObject({
        status: 'CONFIRMED',
        payment: { id: first.body.paymentId, status: 'SUCCESS' },
      });
    });

    it('replays the first response for a repeated Idempotency-Key', async () => {
      const { hold } = await holdSeat();
      const key = `test-${hold.holdId}`;
      const first = await pay(hold, { phone: WAITS }, key).expect(201);
      const again = await pay(hold, { phone: WAITS }, key).expect(201);
      expect(again.body).toEqual(first.body);

      const different = await pay(hold, { phone: PAYS }, key).expect(409);
      expect(different.body.error.code).toBe('INVALID_STATE');
    });

    it('checks the number and the network', async () => {
      const { hold } = await holdSeat();

      const wrongNetwork = await pay(hold, {
        phone: '0201234567',
        network: 'MTN',
      }).expect(400);
      expect(wrongNetwork.body.error).toMatchObject({
        code: 'NETWORK_MISMATCH',
        details: { network: 'TELECEL' },
      });

      const notGhana = await pay(hold, { phone: '+44 20 7946 0958' }).expect(
        400,
      );
      expect(notGhana.body.error.code).toBe('INVALID_PHONE');

      const missing = await pay(hold, {
        phone: undefined,
        network: undefined,
        contactEmail: 'nope',
      }).expect(400);
      expect(Object.keys(missing.body.error.details.fields).sort()).toEqual([
        'contactEmail',
        'network',
        'phone',
      ]);
      // Nothing was charged and the hold is untouched
      expect((await booking(hold.holdId)).status).toBe('HELD');
    });

    it('refuses a hold that ran out', async () => {
      const { trip, hold } = await holdSeat();
      await prisma.tripSeat.updateMany({
        where: { tripId: trip.id, label: '1' },
        data: { holdExpiresAt: minutesFromNow(-1) },
      });

      const res = await pay(hold).expect(409);
      expect(res.body.error.code).toBe('HOLD_EXPIRED');
    });

    it('starts a card payment with a checkout link', async () => {
      const { hold } = await holdSeat();
      const res = await pay(hold, {
        method: 'CARD',
        phone: undefined,
        network: undefined,
      }).expect(201);

      expect(res.body).toMatchObject({
        status: 'PENDING',
        method: 'CARD',
        authorizationUrl: expect.stringMatching(/^fake:\/\/checkout\//),
        displayText: 'Finish paying on the card page',
      });
    });

    it('marks the trip FULL when the last seat sells', async () => {
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
        seatsSold: 3,
      });
      const { hold } = await holdSeat('4', trip);
      const started = await pay(hold).expect(201);
      await verify(started.body.paymentId, hold.holdToken).expect(200);

      const after = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
      });
      expect(after).toMatchObject({ seatsSold: 4, status: 'FULL' });
    });
  });

  describe('late payments', () => {
    /** Pays, then lets the hold run out before the result comes in. */
    async function payThenExpire() {
      const { trip, hold } = await holdSeat();
      const started = await pay(hold).expect(201);
      const past = minutesFromNow(-1);
      await prisma.booking.update({
        where: { id: hold.holdId },
        data: { holdExpiresAt: past },
      });
      await prisma.tripSeat.updateMany({
        where: { bookingId: hold.holdId },
        data: { holdExpiresAt: past },
      });
      // Any seat read releases the expired hold
      await http().get(`/api/v1/trips/${trip.id}/seats`).expect(200);
      expect((await booking(hold.holdId)).status).toBe('EXPIRED');
      return { trip, hold, paymentId: started.body.paymentId as string };
    }

    it('takes the seat back if it is still free', async () => {
      const { trip, hold, paymentId } = await payThenExpire();

      const res = await verify(paymentId, hold.holdToken).expect(200);
      expect(res.body).toMatchObject({
        status: 'SUCCESS',
        bookingStatus: 'CONFIRMED',
      });
      expect(await seat(trip.id, '1')).toMatchObject({
        status: 'SOLD',
        bookingId: hold.holdId,
      });
    });

    it('marks the booking for a refund if someone else has the seat', async () => {
      const { trip, hold, paymentId } = await payThenExpire();
      const other = await http()
        .post('/api/v1/holds')
        .send({ tripId: trip.id, seatLabel: '1' })
        .expect(201);

      const res = await verify(paymentId, hold.holdToken).expect(200);
      expect(res.body).toMatchObject({
        status: 'SUCCESS',
        bookingStatus: 'REFUND_PENDING',
      });
      expect((await seat(trip.id, '1')).bookingId).toBe(other.body.holdId);
    });
  });

  describe('several seats', () => {
    async function holdSeats(labels: string[]) {
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: minutesFromNow(120),
      });
      const res = await http()
        .post('/api/v1/holds')
        .send({ tripId: trip.id, seatLabels: labels })
        .expect(201);
      return {
        trip,
        hold: res.body as { holdId: string; holdToken: string },
      };
    }
    const seatsOf = (tripId: string) =>
      prisma.booking.findMany({
        where: { tripId },
        orderBy: { id: 'asc' },
      });

    it('charges once for the whole hold and issues a ticket per seat', async () => {
      const { trip, hold } = await holdSeats(['2', '1']);

      const started = await pay(hold).expect(201);
      expect(started.body).toMatchObject({
        status: 'PENDING',
        amountPesewas: 5100 * 2,
        tickets: [],
      });
      expect(
        await prisma.payment.count({ where: { booking: { tripId: trip.id } } }),
      ).toBe(1);
      expect((await seatsOf(trip.id)).map((b) => b.status)).toEqual([
        'PENDING_PAYMENT',
        'PENDING_PAYMENT',
      ]);

      const paid = await verify(started.body.paymentId, hold.holdToken).expect(
        200,
      );
      const bookings = await seatsOf(trip.id);
      expect(bookings.map((b) => b.status)).toEqual(['CONFIRMED', 'CONFIRMED']);
      expect(paid.body.tickets).toEqual([
        {
          code: bookings[0].code,
          seatLabel: '2',
          ticketToken: expect.any(String),
        },
        {
          code: bookings[1].code,
          seatLabel: '1',
          ticketToken: expect.any(String),
        },
      ]);
      expect(bookings[1]).toMatchObject({
        contactEmail: 'ama@example.com',
        passengerName: 'Ama Mensah',
      });
      const after = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
      });
      expect(after.seatsSold).toBe(2);

      // Each ticket opens with the hold token it was paid with
      await http()
        .get(`/api/v1/tickets/${bookings[1].code}`)
        .set('X-Hold-Token', hold.holdToken)
        .expect(200);
    });

    it('keeps every seat held after a decline', async () => {
      const { trip, hold } = await holdSeats(['1', '2']);
      const started = await pay(hold, { phone: DECLINES }).expect(201);
      const res = await verify(started.body.paymentId, hold.holdToken).expect(
        200,
      );
      expect(res.body).toMatchObject({ status: 'FAILED', tickets: [] });
      expect((await seatsOf(trip.id)).map((b) => b.status)).toEqual([
        'HELD',
        'HELD',
      ]);
    });

    it('refunds only the seat lost to a late payment', async () => {
      const { trip, hold } = await holdSeats(['1', '2']);
      const started = await pay(hold).expect(201);
      const past = minutesFromNow(-1);
      await prisma.booking.updateMany({
        where: { tripId: trip.id },
        data: { holdExpiresAt: past },
      });
      await prisma.tripSeat.updateMany({
        where: { tripId: trip.id, status: 'HELD' },
        data: { holdExpiresAt: past },
      });
      await http()
        .post('/api/v1/holds')
        .send({ tripId: trip.id, seatLabel: '2' })
        .expect(201);

      const res = await verify(started.body.paymentId, hold.holdToken).expect(
        200,
      );
      expect(
        res.body.tickets.map((t: { seatLabel: string }) => t.seatLabel),
      ).toEqual(['1']);
      const [kept, lost] = await prisma.booking.findMany({
        where: { OR: [{ id: hold.holdId }, { groupId: hold.holdId }] },
        orderBy: { id: 'asc' },
      });
      expect(kept.status).toBe('CONFIRMED');
      expect(lost.status).toBe('REFUND_PENDING');

      await app.get(PaymentsService).requestRefunds();
      expect((await booking(lost.id)).refundRequestedAt).toEqual(
        expect.any(Date),
      );
      expect((await booking(kept.id)).refundRequestedAt).toBeNull();
    });
  });

  describe('GET /payments/:id and verify', () => {
    it('asks the provider when a poll finds it pending for 30 seconds', async () => {
      const { hold } = await holdSeat();
      const started = await pay(hold).expect(201);

      // A fresh payment isn't checked yet
      const early = await poll(started.body.paymentId, hold.holdToken).expect(
        200,
      );
      expect(early.body.status).toBe('PENDING');

      await prisma.payment.update({
        where: { id: started.body.paymentId },
        data: { createdAt: new Date(Date.now() - 31_000) },
      });
      const later = await poll(started.body.paymentId, hold.holdToken).expect(
        200,
      );
      expect(later.body).toMatchObject({
        status: 'SUCCESS',
        bookingCode: expect.stringMatching(/^SL-/),
      });
    });

    it('abandons a payment still pending after 10 minutes', async () => {
      const { hold } = await holdSeat();
      const started = await pay(hold, { phone: WAITS }).expect(201);
      await prisma.payment.update({
        where: { id: started.body.paymentId },
        data: { createdAt: minutesFromNow(-11) },
      });

      const res = await poll(started.body.paymentId, hold.holdToken).expect(
        200,
      );
      expect(res.body).toMatchObject({
        status: 'ABANDONED',
        failureCode: 'ABANDONED',
        bookingStatus: 'HELD',
      });
    });

    it('limits "I have approved it" to once every 5 seconds', async () => {
      const { hold } = await holdSeat();
      const started = await pay(hold, { phone: WAITS }).expect(201);

      await verify(started.body.paymentId, hold.holdToken).expect(200);
      const again = await verify(started.body.paymentId, hold.holdToken).expect(
        429,
      );
      expect(again.body.error.code).toBe('RATE_LIMITED');
      expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('needs the hold token', async () => {
      const { hold } = await holdSeat();
      const started = await pay(hold, { phone: WAITS }).expect(201);

      await http()
        .get(`/api/v1/payments/${started.body.paymentId}`)
        .expect(401);
      const wrong = await poll(started.body.paymentId, 'wrong').expect(404);
      expect(wrong.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /webhooks/paystack', () => {
    it('rejects calls without a valid signature', async () => {
      const res = await http()
        .post('/api/v1/webhooks/paystack')
        .set('x-paystack-signature', 'forged')
        .send({ event: 'charge.success', data: { reference: 'x' } })
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });
});
