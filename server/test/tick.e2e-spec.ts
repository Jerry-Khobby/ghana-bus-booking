import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { FakeProvider } from './../src/payments/providers/fake.provider.js';
import { PAYMENT_PROVIDER } from './../src/payments/providers/payment-provider.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

// The tick sweeps the whole database (seed data too), so these tests check
// what happened to their own rows rather than exact totals.
describe('POST /internal/tick (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fake: FakeProvider;
  let fx: Fixture;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fake = app.get(PAYMENT_PROVIDER);
    fx = await createFixture(prisma);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const tick = () =>
    http()
      .post('/api/v1/internal/tick')
      .set('X-Tick-Secret', 'test-tick-secret');

  /** A hold and a payment started on a fresh trip. */
  async function holdAndPay(phone: string, label = '1') {
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
          phone,
          network: 'MTN',
          contactEmail: 'ama@example.com',
        })
        .expect(201)
    ).body;
    return { trip, hold, paymentId: payment.paymentId as string };
  }

  it('needs the scheduler secret', async () => {
    await http().post('/api/v1/internal/tick').expect(401);
    const wrong = await http()
      .post('/api/v1/internal/tick')
      .set('X-Tick-Secret', 'guess')
      .expect(401);
    expect(wrong.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('frees expired holds and moves trips along', async () => {
    const trip = await fx.createTrip({
      bayId: fx.bays[1].id,
      loadingStartsAt: minutesFromNow(-5),
      departureAt: minutesFromNow(55),
    });
    const held = await fx.createBooking(
      trip.id,
      '2',
      'HELD',
      minutesFromNow(-1),
    );

    const res = await tick().expect(200);
    expect(res.body.holdsFreed).toBeGreaterThanOrEqual(1);
    expect(res.body.tripsUpdated).toBeGreaterThanOrEqual(1);

    expect(
      await prisma.booking.findUniqueOrThrow({ where: { id: held.id } }),
    ).toMatchObject({ status: 'EXPIRED' });
    expect(
      await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } }),
    ).toMatchObject({ status: 'LOADING' });
  });

  it('settles payments left pending, and abandons old ones', async () => {
    const paid = await holdAndPay('0240000000', '3');
    const stuck = await holdAndPay('0241234567', '4');
    await prisma.payment.update({
      where: { id: paid.paymentId },
      data: { createdAt: minutesFromNow(-3) },
    });
    await prisma.payment.update({
      where: { id: stuck.paymentId },
      data: { createdAt: minutesFromNow(-11) },
    });

    const res = await tick().expect(200);
    expect(res.body.paymentsChecked).toBeGreaterThanOrEqual(2);

    const status = async (id: string) =>
      (await prisma.payment.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(paid.paymentId)).toBe('SUCCESS');
    expect(await status(stuck.paymentId)).toBe('ABANDONED');
  });

  it('requests a refund once for a late payment', async () => {
    const { trip, hold, paymentId } = await holdAndPay('0240000000', '1');
    // The hold runs out and someone else takes the seat before it's paid
    const past = minutesFromNow(-1);
    await prisma.booking.update({
      where: { id: hold.holdId },
      data: { holdExpiresAt: past },
    });
    await prisma.tripSeat.updateMany({
      where: { bookingId: hold.holdId },
      data: { holdExpiresAt: past },
    });
    await http().get(`/api/v1/trips/${trip.id}/seats`).expect(200);
    await http()
      .post('/api/v1/holds')
      .send({ tripId: trip.id, seatLabel: '1' })
      .expect(201);
    await http()
      .post(`/api/v1/payments/${paymentId}/verify`)
      .set('X-Hold-Token', hold.holdToken)
      .expect(200);

    const { providerRef } = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    const first = await tick().expect(200);
    expect(first.body.refundsRequested).toBeGreaterThanOrEqual(1);
    expect(fake.refunds.filter((r) => r === providerRef)).toHaveLength(1);

    // Recorded, so the next tick doesn't ask again
    await tick().expect(200);
    expect(fake.refunds.filter((r) => r === providerRef)).toHaveLength(1);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: hold.holdId },
    });
    expect(booking.refundRequestedAt).toEqual(expect.any(Date));
  });
});
