import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { MAILER, type Mailer } from './../src/messages/mailer.js';
import { MessagesService } from './../src/messages/messages.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

describe('Email outbox (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mailer: Mailer;
  let messages: MessagesService;
  let fx: Fixture;
  let realSend: Mailer['send'];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    mailer = app.get(MAILER);
    messages = app.get(MessagesService);
    realSend = mailer.send.bind(mailer);
    fx = await createFixture(prisma);
  });

  afterEach(() => {
    mailer.send = realSend;
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Holds a seat and pays for it (the fake provider approves 0000). */
  async function holdAndPay(label = '1', trip?: { id: string }) {
    trip ??= await fx.createTrip({
      loadingStartsAt: minutesFromNow(60),
      departureAt: minutesFromNow(120),
    });
    const hold = (
      await http()
        .post('/api/v1/holds')
        .send({ tripId: trip.id, seatLabel: label })
        .expect(201)
    ).body;
    const started = await http()
      .post(`/api/v1/holds/${hold.holdId}/pay`)
      .set('X-Hold-Token', hold.holdToken)
      .send({
        method: 'MOMO',
        phone: '0240000000',
        network: 'MTN',
        contactEmail: 'ama@example.com',
        passengerName: 'Ama Mensah',
      })
      .expect(201);
    return { trip, hold, paymentId: started.body.paymentId as string };
  }
  const verify = (paymentId: string, token: string) =>
    http()
      .post(`/api/v1/payments/${paymentId}/verify`)
      .set('X-Hold-Token', token)
      .expect(200);
  const messagesFor = (bookingId: string) =>
    prisma.outboundMessage.findMany({ where: { bookingId } });

  it('sends the ticket email once paid, with a link that opens the ticket', async () => {
    const sent: Parameters<Mailer['send']>[0][] = [];
    mailer.send = async (message) => {
      sent.push(message);
    };
    const { hold, paymentId } = await holdAndPay();
    await verify(paymentId, hold.holdToken);

    const [message] = await messagesFor(hold.holdId);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: hold.holdId },
    });
    expect(message).toMatchObject({
      channel: 'EMAIL',
      to: 'ama@example.com',
      template: 'ticket',
      status: 'SENT',
      attempts: 1,
      subject: `Your Seatline ticket ${booking.code} · Testville ${fx.suffix} → Testtown ${fx.suffix}, seat 1`,
    });

    // What went out: HTML, plain text and the QR as an inline image
    expect(sent).toHaveLength(1);
    expect(sent[0].attachments).toMatchObject([
      { cid: 'qr', filename: `${booking.code}.png` },
    ]);
    expect(sent[0].attachments![0].content.subarray(1, 4).toString()).toBe(
      'PNG',
    );
    const link = new RegExp(
      `http://web\\.test/ticket/${booking.code}\\?t=([\\w.%-]+)`,
    ).exec(sent[0].text);
    expect(link).not.toBeNull();

    // The emailed link really opens the ticket
    await http()
      .get(`/api/v1/tickets/${booking.code}`)
      .query({ t: decodeURIComponent(link![1]) })
      .expect(200);
  });

  it('sends the apology when a late payment finds the seat sold', async () => {
    const { trip, hold, paymentId } = await holdAndPay('2');
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
      .send({ tripId: trip.id, seatLabel: '2' })
      .expect(201);

    await verify(paymentId, hold.holdToken);

    expect(await messagesFor(hold.holdId)).toMatchObject([
      {
        template: 'late-refund',
        status: 'SENT',
        subject: "We're refunding your Seatline payment",
      },
    ]);
  });

  it('keeps a failed email queued, and the retry sends it', async () => {
    mailer.send = async () => {
      throw new Error('SMTP unavailable');
    };
    const { hold, paymentId } = await holdAndPay('3');
    // The payment still succeeds when the email can't go out
    const paid = await verify(paymentId, hold.holdToken);
    expect(paid.body.status).toBe('SUCCESS');

    const [failed] = await messagesFor(hold.holdId);
    expect(failed).toMatchObject({
      status: 'QUEUED',
      attempts: 1,
      lastError: 'SMTP unavailable',
    });

    // The tick only retries messages older than a minute
    mailer.send = realSend;
    await prisma.outboundMessage.update({
      where: { id: failed.id },
      data: { createdAt: minutesFromNow(-2) },
    });
    await messages.sendQueued();

    const [retried] = await messagesFor(hold.holdId);
    expect(retried).toMatchObject({
      status: 'SENT',
      attempts: 2,
      lastError: null,
    });
  });

  it('gives up after five failed attempts', async () => {
    mailer.send = async () => {
      throw new Error('Mailbox full');
    };
    const { hold, paymentId } = await holdAndPay('4');
    await verify(paymentId, hold.holdToken);
    const [message] = await messagesFor(hold.holdId);

    for (let i = 0; i < 4; i++) await messages.send([message.id]);

    expect(
      await prisma.outboundMessage.findUniqueOrThrow({
        where: { id: message.id },
      }),
    ).toMatchObject({ status: 'FAILED', attempts: 5 });
  });
});
