import { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { FAKE_WEBHOOK_SECRET } from './../src/payments/providers/fake.provider.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

// Webhooks signed the way Paystack signs them (HMAC-SHA512 of the raw body)
describe('Paystack webhooks (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fx = await createFixture(prisma);
  });

  afterAll(async () => {
    await prisma.webhookEvent.deleteMany({
      where: { eventId: { contains: fx.suffix } },
    });
    await fx?.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const webhook = (event: object) => {
    const body = JSON.stringify(event);
    return http()
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set(
        'x-paystack-signature',
        createHmac('sha512', FAKE_WEBHOOK_SECRET).update(body).digest('hex'),
      )
      .send(body);
  };

  /** A held seat with a payment out (the fake provider pays 0000). */
  async function pendingPayment() {
    const trip = await fx.createTrip({
      loadingStartsAt: minutesFromNow(60),
      departureAt: minutesFromNow(120),
    });
    const hold = (
      await http()
        .post('/api/v1/holds')
        .send({ tripId: trip.id, seatLabel: '1' })
        .expect(201)
    ).body;
    const { paymentId } = (
      await http()
        .post(`/api/v1/holds/${hold.holdId}/pay`)
        .set('X-Hold-Token', hold.holdToken)
        .send({
          method: 'MOMO',
          phone: '0240000000',
          network: 'MTN',
          contactEmail: `wh@${fx.suffix}.test`,
        })
        .expect(201)
    ).body;
    const { providerRef } = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    return { hold, paymentId, providerRef };
  }

  it('settles a payment from charge.success, once', async () => {
    const { hold, providerRef } = await pendingPayment();
    const event = {
      event: 'charge.success',
      data: { id: `txn-${fx.suffix}-1`, reference: providerRef },
    };

    await webhook(event).expect(200);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: hold.holdId },
    });
    expect(booking.status).toBe('CONFIRMED');

    // Paystack retries: the same event is acknowledged and ignored
    await webhook(event).expect(200);
    expect(
      await prisma.webhookEvent.count({
        where: { eventId: `charge.success:txn-${fx.suffix}-1` },
      }),
    ).toBe(1);
  });

  it('marks a refunded booking REFUNDED, and retries a failed refund', async () => {
    const { hold, paymentId, providerRef } = await pendingPayment();
    await webhook({
      event: 'charge.success',
      data: { id: `txn-${fx.suffix}-2`, reference: providerRef },
    }).expect(200);
    // As if the trip was cancelled and the refund requested
    const asked = () =>
      prisma.booking.update({
        where: { id: hold.holdId },
        data: { status: 'REFUND_PENDING', refundRequestedAt: new Date() },
      });
    await asked();

    await webhook({
      event: 'refund.failed',
      data: { id: `rf-${fx.suffix}-1`, transaction_reference: providerRef },
    }).expect(200);
    const afterFail = await prisma.booking.findUniqueOrThrow({
      where: { id: hold.holdId },
    });
    // The tick will ask Paystack again
    expect(afterFail.refundRequestedAt).toBeNull();
    await asked();

    await webhook({
      event: 'refund.processed',
      data: { id: `rf-${fx.suffix}-2`, transaction_reference: providerRef },
    }).expect(200);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: hold.holdId } }))
        .status,
    ).toBe('REFUNDED');
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }))
        .providerPayload,
    ).toMatchObject({ refundedAt: expect.any(String) });
  });

  it('ignores events for payments it never made', async () => {
    await webhook({
      event: 'charge.success',
      data: { id: `txn-${fx.suffix}-x`, reference: 'not-ours' },
    }).expect(200);
  });
});
