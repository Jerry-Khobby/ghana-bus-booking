import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { TicketsService } from './../src/tickets/tickets.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

const PASSWORD = 'mango-bay-42-sunrise';

describe('Agent console (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tickets: TicketsService;
  let fx: Fixture;
  let kofi: string; // agent at bay 1
  let admin: string; // operator admin, every bay
  let shift: { id: string }; // the bus loading at Kofi's bay

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    tickets = app.get(TicketsService);
    fx = await createFixture(prisma);

    const login = async (email: string, as: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/v1/staff/auth/login')
          .send({ email, password: PASSWORD, as })
          .expect(200)
      ).body.accessToken as string;
    const agent = await fx.createStaff({
      password: PASSWORD,
      bayNumbers: [1],
      name: 'Kofi A.',
    });
    const boss = await fx.createStaff({
      role: 'OPERATOR_ADMIN',
      password: PASSWORD,
    });
    kofi = await login(agent.email, 'AGENT');
    admin = await login(boss.email, 'OPERATOR');

    shift = await fx.createTrip({
      status: 'LOADING',
      loadingStartsAt: minutesFromNow(-20),
      departureAt: minutesFromNow(40),
    });
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (token: string, path: string) =>
    request(app.getHttpServer()).get(`/api/v1${path}`).set(as(token));
  const post = (token: string, path: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set(as(token))
      .send(body);

  /** A loading bus at bay 2, which only the admin works. */
  const bay2Trip = () =>
    fx.createTrip({
      bayId: fx.bays[1].id,
      status: 'LOADING',
      loadingStartsAt: minutesFromNow(-20),
      departureAt: minutesFromNow(40),
    });

  describe("Kofi's shift", () => {
    it('shows the bus loading at his bay', async () => {
      const res = await get(kofi, '/agent/console').expect(200);
      expect(res.body).toMatchObject({
        bay: { id: fx.bays[0].id, number: 1 },
        trip: {
          id: shift.id,
          status: 'LOADING',
          banner: expect.stringMatching(/^Loading — leaves at \d\d:\d\d$/),
          departDue: false,
        },
        counts: { total: 4, sold: 0, free: 4, boarded: 0 },
      });
      expect(res.body.seats.map((s: { label: string }) => s.label)).toEqual([
        '1',
        '2',
        '3',
        '4',
      ]);
    });

    it('sells a cash seat, picking the lowest free number', async () => {
      const res = await post(kofi, `/agent/trips/${shift.id}/walk-ins`, {
        method: 'CASH',
        passengerName: 'Yaw Owusu',
        phone: '024 123 4567',
      }).expect(201);

      expect(res.body.booking).toMatchObject({
        seatLabel: '1',
        status: 'CONFIRMED',
        totalPesewas: 5000, // walk-ins pay no service fee
      });
      expect(res.body.ticketUrl).toMatch(/\/ticket\/SL-.+\?t=/);

      const booking = await prisma.booking.findUniqueOrThrow({
        where: { code: res.body.booking.code },
        include: { cashEntry: true, payments: true },
      });
      expect(booking).toMatchObject({
        channel: 'WALK_IN',
        feePesewas: 0,
        contactPhone: '+233241234567',
      });
      expect(booking.cashEntry).toMatchObject({ amountPesewas: 5000 });
      expect(booking.payments).toMatchObject([
        { method: 'CASH', provider: 'CASH', status: 'SUCCESS' },
      ]);

      const console = await get(kofi, '/agent/console').expect(200);
      expect(console.body.counts).toMatchObject({ sold: 1, walkIn: 1 });
    });

    it('scans an online ticket green, boards it, then sees it red', async () => {
      const online = await fx.createBooking(shift.id, '2', 'CONFIRMED');
      const qrPayload = tickets.qrPayload(online);

      const valid = await post(kofi, '/agent/scan', {
        tripId: shift.id,
        qrPayload,
      }).expect(200);
      expect(valid.body).toMatchObject({
        result: 'VALID',
        message: 'Valid ticket · seat 2',
        ticket: { code: online.code, seatLabel: '2', channel: 'ONLINE' },
      });

      await post(kofi, `/agent/tickets/${online.code}/board`).expect(200);

      const used = await post(kofi, '/agent/scan', {
        tripId: shift.id,
        qrPayload,
      }).expect(200);
      expect(used.body).toMatchObject({
        result: 'REJECTED',
        reason: 'ALREADY_BOARDED',
        message: expect.stringMatching(/^Already used at \d\d:\d\d$/),
      });

      // A second agent tapping Board at the same time can't board it twice
      const twice = await post(
        kofi,
        `/agent/tickets/${online.code}/board`,
      ).expect(409);
      expect(twice.body.error.code).toBe('ALREADY_BOARDED');

      const logs = await prisma.scanLog.findMany({
        where: { bookingId: online.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.result)).toEqual([
        'VALID',
        'BOARDED',
        'REJECTED',
      ]);
    });

    it('rejects forged QRs and tickets for another bus', async () => {
      const forged = await post(kofi, '/agent/scan', {
        tripId: shift.id,
        qrPayload: 'SL1.SL-AAAA-BB.12345678.notarealsignatureatall',
      }).expect(200);
      expect(forged.body).toMatchObject({
        result: 'REJECTED',
        reason: 'NOT_FOUND',
      });

      const other = await fx.createTrip({
        departureAt: minutesFromNow(200),
        loadingStartsAt: minutesFromNow(140),
      });
      const elsewhere = await fx.createBooking(other.id, '1', 'CONFIRMED');
      const qr = tickets.qrPayload(elsewhere);

      const tampered = await post(kofi, '/agent/scan', {
        tripId: shift.id,
        qrPayload: qr.slice(0, -2) + (qr.endsWith('AA') ? 'BB' : 'AA'),
      }).expect(200);
      expect(tampered.body.reason).toBe('BAD_SIGNATURE');

      const wrong = await post(kofi, '/agent/scan', {
        tripId: shift.id,
        code: elsewhere.code,
      }).expect(200);
      expect(wrong.body).toMatchObject({
        result: 'REJECTED',
        reason: 'WRONG_TRIP',
        message: `This ticket is for Testville ${fx.suffix} (North) → Testtown ${fx.suffix} (South), bay 1`,
      });
    });

    it('lists the passengers by seat with masked phones', async () => {
      const res = await get(kofi, `/agent/trips/${shift.id}/manifest`).expect(
        200,
      );
      expect(res.body).toMatchObject([
        {
          seatLabel: '1',
          passengerName: 'Yaw Owusu',
          phoneMasked: '024 *** 4567',
          channel: 'WALK_IN',
          status: 'CONFIRMED',
        },
        { seatLabel: '2', channel: 'ONLINE', status: 'BOARDED' },
      ]);
    });

    it('sums the cash he took today', async () => {
      const res = await get(kofi, '/agent/sales').expect(200);
      expect(res.body).toMatchObject({
        count: 1,
        cashPesewas: 5000,
        momoPesewas: 0,
        items: [{ seatLabel: '1', method: 'CASH' }],
      });
    });

    it('asks before departing with unboarded passengers, then departs', async () => {
      const ask = await post(kofi, `/agent/trips/${shift.id}/depart`).expect(
        409,
      );
      expect(ask.body.error).toMatchObject({
        code: 'UNBOARDED_PASSENGERS',
        details: { count: 1 },
      });

      const res = await post(kofi, `/agent/trips/${shift.id}/depart`, {
        confirmUnboarded: true,
      }).expect(200);
      expect(res.body).toMatchObject({
        trip: { id: shift.id, status: 'DEPARTED' },
        noShows: 1,
      });

      // The unboarded walk-in is a no-show; the boarded one stays boarded
      const bookings = await prisma.booking.findMany({
        where: { tripId: shift.id },
        select: { seatLabel: true, status: true },
        orderBy: { seatLabel: 'asc' },
      });
      expect(bookings).toEqual([
        { seatLabel: '1', status: 'NO_SHOW' },
        { seatLabel: '2', status: 'BOARDED' },
      ]);
    });
  });

  describe('selling', () => {
    it('only sells while the bus is loading', async () => {
      const later = await fx.createTrip({
        bayId: fx.bays[1].id,
        loadingStartsAt: minutesFromNow(100),
        departureAt: minutesFromNow(160),
      });
      const res = await post(admin, `/agent/trips/${later.id}/walk-ins`, {
        method: 'CASH',
      }).expect(409);
      expect(res.body.error.code).toBe('TRIP_NOT_BOOKABLE');
    });

    it('sells by mobile money and confirms when paid', async () => {
      const trip = await bay2Trip();
      const sold = await post(admin, `/agent/trips/${trip.id}/walk-ins`, {
        method: 'MOMO',
        seatLabel: '3',
        momoPhone: '0240000000',
        network: 'MTN',
      }).expect(202);
      expect(sold.body).toMatchObject({
        seatLabel: '3',
        payment: { status: 'PENDING', bookingStatus: 'PENDING_PAYMENT' },
      });

      // The console polls; after 30 seconds it asks the provider
      await prisma.payment.update({
        where: { id: sold.body.payment.paymentId },
        data: { createdAt: new Date(Date.now() - 31_000) },
      });
      const paid = await get(
        admin,
        `/agent/payments/${sold.body.payment.paymentId}`,
      ).expect(200);
      expect(paid.body).toMatchObject({
        status: 'SUCCESS',
        bookingStatus: 'CONFIRMED',
      });
    });
  });

  describe('voiding a sale', () => {
    it('is for admins, cancels the sale and keeps an audit record', async () => {
      const trip = await bay2Trip();
      const sold = await post(admin, `/agent/trips/${trip.id}/walk-ins`, {
        method: 'CASH',
      }).expect(201);
      const code = sold.body.booking.code as string;

      const byAgent = await post(kofi, `/agent/bookings/${code}/void`, {
        reason: 'Sold the wrong seat',
      }).expect(403);
      expect(byAgent.body.error.code).toBe('ROLE_NOT_ALLOWED');

      await post(admin, `/agent/bookings/${code}/void`, {
        reason: 'Sold the wrong seat',
      }).expect(200);

      const booking = await prisma.booking.findUniqueOrThrow({
        where: { code },
        include: { cashEntry: true, tripSeat: true },
      });
      expect(booking.status).toBe('CANCELLED');
      expect(booking.cashEntry).toBeNull();
      expect(booking.tripSeat).toMatchObject({
        status: 'AVAILABLE',
        bookingId: null,
      });
      expect(
        await prisma.auditLog.findFirst({
          where: { entityId: booking.id, action: 'booking.void' },
        }),
      ).toMatchObject({ after: { reason: 'Sold the wrong seat' } });

      const again = await post(admin, `/agent/bookings/${code}/void`, {
        reason: 'Again',
      }).expect(409);
      expect(again.body.error.code).toBe('INVALID_STATE');
    });

    it('refuses once the cash has been collected', async () => {
      const trip = await bay2Trip();
      const sold = await post(admin, `/agent/trips/${trip.id}/walk-ins`, {
        method: 'CASH',
      }).expect(201);
      await prisma.cashEntry.updateMany({
        where: { booking: { code: sold.body.booking.code } },
        data: { settledAt: new Date() },
      });

      const res = await post(
        admin,
        `/agent/bookings/${sold.body.booking.code}/void`,
        { reason: 'Too late' },
      ).expect(409);
      expect(res.body.error.code).toBe('CASH_SETTLED');
    });
  });

  describe('loading', () => {
    it('one bus loads per bay', async () => {
      const loading = await bay2Trip();
      const next = await fx.createTrip({
        bayId: fx.bays[1].id,
        loadingStartsAt: minutesFromNow(100),
        departureAt: minutesFromNow(160),
      });

      const busy = await post(
        admin,
        `/agent/trips/${next.id}/start-loading`,
      ).expect(409);
      expect(busy.body.error.code).toBe('BAY_BUSY');

      await prisma.trip.updateMany({
        where: { bayId: fx.bays[1].id, status: { in: ['LOADING', 'FULL'] } },
        data: { status: 'DEPARTED' },
      });
      await post(admin, `/agent/trips/${next.id}/start-loading`).expect(200);
      expect(loading.id).not.toBe(next.id);
    });
  });

  describe('bay queue', () => {
    it('lists the next buses at the bay with what has sold', async () => {
      await bay2Trip();
      const first = await fx.createTrip({
        bayId: fx.bays[1].id,
        loadingStartsAt: minutesFromNow(20),
        departureAt: minutesFromNow(30),
      });
      const second = await fx.createTrip({
        bayId: fx.bays[1].id,
        loadingStartsAt: minutesFromNow(25),
        departureAt: minutesFromNow(35),
      });
      await fx.createBooking(first.id, '2', 'CONFIRMED');

      const res = await get(
        admin,
        `/agent/console?bayId=${fx.bays[1].id}`,
      ).expect(200);
      expect(res.body.queue.slice(0, 2)).toMatchObject([
        {
          id: first.id,
          status: 'SCHEDULED',
          plate: expect.any(String),
          destination: { name: 'South' },
          counts: { total: 4, sold: 1, online: 1, walkIn: 0 },
        },
        { id: second.id, counts: { sold: 0 } },
      ]);
      expect(res.body.nextTrip).toMatchObject({ id: first.id });
    });
  });

  describe('access', () => {
    it('keeps agents to their own bays and passengers out', async () => {
      const trip = await bay2Trip();
      const res = await get(kofi, `/agent/trips/${trip.id}/manifest`).expect(
        404,
      );
      expect(res.body.error.code).toBe('NOT_FOUND');

      await request(app.getHttpServer())
        .get('/api/v1/agent/console')
        .expect(401);
    });
  });
});
