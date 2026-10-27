import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  signTicketLink,
  verifyQrPayload,
} from './../src/tickets/ticket-signing.js';
import { TicketsService } from './../src/tickets/tickets.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

describe('Tickets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tickets: TicketsService;
  let fx: Fixture;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    tickets = app.get(TicketsService);
    fx = await createFixture(prisma);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const departure = () => minutesFromNow(120);

  /** A confirmed booking on a trip leaving in two hours, and its link token. */
  async function confirmedTicket(label = '1') {
    const trip = await fx.createTrip({
      loadingStartsAt: minutesFromNow(60),
      departureAt: departure(),
    });
    const booking = await fx.createBooking(trip.id, label, 'CONFIRMED');
    await prisma.booking.update({
      where: { id: booking.id },
      data: { passengerName: 'Ama Mensah' },
    });
    return { trip, booking, t: tickets.linkToken(booking.code, trip) };
  }

  describe('GET /tickets/:code', () => {
    it('opens with the signed link and carries a QR that verifies', async () => {
      const { trip, booking, t } = await confirmedTicket();

      const res = await http()
        .get(`/api/v1/tickets/${booking.code}`)
        .query({ t })
        .expect(200);

      expect(res.body).toMatchObject({
        code: booking.code,
        status: 'CONFIRMED',
        seatLabel: '1',
        passengerName: 'Ama Mensah',
        totalPesewas: 5100,
        currency: 'GHS',
        operator: { name: fx.operator.name },
        route: {
          origin: { name: 'North' },
          destination: { name: 'South' },
        },
        bus: { plate: fx.bus.plate, type: 'MINIBUS' },
        bay: { number: 1 },
        mode: 'FIXED_TIME',
        tripStatus: 'SCHEDULED',
      });
      expect(
        verifyQrPayload('test-qr-secret', res.body.qrPayload, {
          code: booking.code,
          tripId: trip.id,
          qrNonce: booking.qrNonce,
        }),
      ).toBe(true);
    });

    it('refuses wrong, expired or missing credentials', async () => {
      const { booking, t } = await confirmedTicket();
      const other = await confirmedTicket('2');

      // A link for another ticket
      const wrong = await http()
        .get(`/api/v1/tickets/${booking.code}`)
        .query({ t: other.t })
        .expect(401);
      expect(wrong.body.error.code).toBe('TOKEN_INVALID');

      const expired = await http()
        .get(`/api/v1/tickets/${booking.code}`)
        .query({
          t: signTicketLink(
            'test-ticket-link-secret',
            booking.code,
            minutesFromNow(-1),
          ),
        })
        .expect(401);
      expect(expired.body.error.message).toBe('This ticket link has expired');

      const none = await http()
        .get(`/api/v1/tickets/${booking.code}`)
        .expect(401);
      expect(none.body.error.code).toBe('UNAUTHENTICATED');

      // The link doesn't open by itself without the code it was made for
      await http()
        .get(`/api/v1/tickets/${booking.code}`)
        .query({ t })
        .expect(200);
    });

    it('only shows confirmed, boarded and no-show bookings', async () => {
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: departure(),
      });
      const held = await fx.createBooking(
        trip.id,
        '3',
        'HELD',
        minutesFromNow(3),
      );

      const res = await http()
        .get(`/api/v1/tickets/${held.code}`)
        .query({ t: tickets.linkToken(held.code, trip) })
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /tickets/:code/pdf', () => {
    it('downloads a one-page PDF', async () => {
      const { booking, t } = await confirmedTicket();

      const res = await http()
        .get(`/api/v1/tickets/${booking.code}/pdf`)
        .query({ t })
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="seatline-${booking.code}.pdf"`,
      );
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(2000);
    });
  });

  describe('after paying', () => {
    it('the payment hands over the ticket, and the hold token opens it', async () => {
      const trip = await fx.createTrip({
        loadingStartsAt: minutesFromNow(60),
        departureAt: departure(),
      });
      const hold = (
        await http()
          .post('/api/v1/holds')
          .send({ tripId: trip.id, seatLabel: '4' })
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
        })
        .expect(201);
      expect(started.body.ticketToken).toBeNull();

      const paid = await http()
        .post(`/api/v1/payments/${started.body.paymentId}/verify`)
        .set('X-Hold-Token', hold.holdToken)
        .expect(200);
      expect(paid.body.ticketToken).toEqual(expect.any(String));

      // With the token from the payment…
      await http()
        .get(`/api/v1/tickets/${paid.body.bookingCode}`)
        .query({ t: paid.body.ticketToken })
        .expect(200);
      // …or with the hold token the passenger already has
      const byHold = await http()
        .get(`/api/v1/tickets/${paid.body.bookingCode}`)
        .set('X-Hold-Token', hold.holdToken)
        .expect(200);
      expect(byHold.body.seatLabel).toBe('4');

      const wrongHold = await http()
        .get(`/api/v1/tickets/${paid.body.bookingCode}`)
        .set('X-Hold-Token', 'someone-else')
        .expect(404);
      expect(wrongHold.body.error.code).toBe('NOT_FOUND');
    });
  });
});
