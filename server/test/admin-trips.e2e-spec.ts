import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { FakeProvider } from './../src/payments/providers/fake.provider.js';
import { PAYMENT_PROVIDER } from './../src/payments/providers/payment-provider.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import type { LayoutCell } from './../src/trips/trip-seats.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

const PASSWORD = 'mango-bay-42-sunrise';
const day = (date: Date) => date.toISOString().slice(0, 10);

describe('Operator admin: trips (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fake: FakeProvider;
  let fx: Fixture;
  let admin: string;
  let kumasi: { id: string };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fake = app.get(PAYMENT_PROVIDER);
    fx = await createFixture(prisma);
    kumasi = await prisma.station.create({
      data: { name: 'Asafo', city: `Kumasi ${fx.suffix}`, region: 'Test' },
    });
    const boss = await fx.createStaff({
      role: 'OPERATOR_ADMIN',
      password: PASSWORD,
    });
    admin = (
      await request(app.getHttpServer())
        .post('/api/v1/staff/auth/login')
        .send({ email: boss.email, password: PASSWORD, as: 'OPERATOR' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await fx?.cleanup();
    await prisma.station.deleteMany({ where: { id: kumasi?.id } });
    await app.close();
  });

  const call = (method: 'get' | 'post' | 'patch', path: string) =>
    request(app.getHttpServer())
      [method](`/api/v1/admin${path}`)
      .set('Authorization', `Bearer ${admin}`);
  const fixedTrip = (overrides: Record<string, unknown> = {}) => ({
    routeId: fx.route.id,
    busId: fx.bus.id,
    bayId: fx.bays[0].id,
    mode: 'FIXED_TIME',
    departureAt: minutesFromNow(24 * 60).toISOString(),
    ...overrides,
  });

  /** A passenger buys seat `label` online and pays (fake provider, 0000). */
  async function buyOnline(tripId: string, label: string, pay = true) {
    const http = () => request(app.getHttpServer());
    const hold = (
      await http()
        .post('/api/v1/holds')
        .send({ tripId, seatLabel: label })
        .expect(201)
    ).body;
    const payment = (
      await http()
        .post(`/api/v1/holds/${hold.holdId}/pay`)
        .set('X-Hold-Token', hold.holdToken)
        .send({
          method: 'MOMO',
          phone: '0240000000',
          network: 'MTN',
          contactEmail: `buyer-${label}@${fx.suffix}.test`,
        })
        .expect(201)
    ).body;
    if (pay) {
      await http()
        .post(`/api/v1/payments/${payment.paymentId}/verify`)
        .set('X-Hold-Token', hold.holdToken)
        .expect(200);
    }
    return { hold, paymentId: payment.paymentId as string };
  }

  it('sets up a route, bus and trip from nothing, and passengers find it', async () => {
    const cells: LayoutCell[] = [
      { r: 0, c: 0, type: 'DRIVER' },
      { r: 1, c: 0, type: 'SEAT', label: 'A1' },
      { r: 1, c: 1, type: 'SEAT', label: 'A2' },
      { r: 2, c: 0, type: 'SEAT', label: 'B1' },
    ];
    const layout = (
      await call('post', '/layouts')
        .send({ name: 'Sprinter', rows: 3, cols: 2, cells })
        .expect(201)
    ).body;
    const bus = (
      await call('post', '/buses')
        .send({
          plate: `SP ${fx.suffix}`,
          type: 'MINIBUS',
          layoutId: layout.id,
        })
        .expect(201)
    ).body;
    const route = (
      await call('post', '/routes')
        .send({
          originStationId: fx.origin.id,
          destinationStationId: kumasi.id,
          baseFarePesewas: 12_000,
          durationMinutes: 270,
        })
        .expect(201)
    ).body;

    const departureAt = minutesFromNow(6 * 60);
    const trip = await call('post', '/trips')
      .send({
        routeId: route.id,
        busId: bus.id,
        bayId: fx.bays[1].id,
        mode: 'FIXED_TIME',
        departureAt: departureAt.toISOString(),
      })
      .expect(201);
    expect(trip.body).toMatchObject({
      status: 'SCHEDULED',
      farePesewas: 12_000,
      total: 3,
      editable: true,
      counts: { free: 3, sold: 0 },
    });
    // Loading starts an hour before by default
    expect(new Date(trip.body.loadingStartsAt).getTime()).toBe(
      departureAt.getTime() - 60 * 60_000,
    );

    const search = await request(app.getHttpServer())
      .get('/api/v1/trips/search')
      .query({ from: fx.origin.id, to: kumasi.id, date: day(departureAt) })
      .expect(200);
    expect(search.body).toMatchObject([
      { id: trip.body.id, seatsLeft: 3, farePesewas: 12_000 },
    ]);
    const seats = await request(app.getHttpServer())
      .get(`/api/v1/trips/${trip.body.id}/seats`)
      .expect(200);
    expect(
      seats.body.cells
        .filter((c: { label?: string }) => c.label)
        .map((c: { label: string }) => c.label),
    ).toEqual(['A1', 'A2', 'B1']);

    expect(
      await prisma.auditLog.count({
        where: { action: 'trip.create', entityId: trip.body.id },
      }),
    ).toBe(1);
  });

  describe('publishing rules', () => {
    it('checks the bay, the times and the bus', async () => {
      const otherStation = await prisma.bay.create({
        data: {
          operatorId: fx.operator.id,
          stationId: fx.destination.id,
          number: 1,
        },
      });
      const wrongBay = await call('post', '/trips')
        .send(fixedTrip({ bayId: otherStation.id }))
        .expect(400);
      expect(wrongBay.body.error.details.fields.bayId).toBeDefined();

      const past = await call('post', '/trips')
        .send(fixedTrip({ departureAt: minutesFromNow(-5).toISOString() }))
        .expect(400);
      expect(past.body.error.details.fields.departureAt).toEqual([
        'The departure time has passed',
      ]);

      const noLeaveBy = await call('post', '/trips')
        .send(
          fixedTrip({
            mode: 'WHEN_FULL',
            departureAt: undefined,
            loadingStartsAt: minutesFromNow(60).toISOString(),
          }),
        )
        .expect(400);
      expect(noLeaveBy.body.error.details.fields.leaveBy).toBeDefined();
    });

    it("won't put one bus on two trips at once", async () => {
      await call('post', '/trips')
        .send(fixedTrip({ departureAt: minutesFromNow(48 * 60).toISOString() }))
        .expect(201);
      const res = await call('post', '/trips')
        .send(
          fixedTrip({
            departureAt: minutesFromNow(48 * 60 + 30).toISOString(),
          }),
        )
        .expect(409);
      expect(res.body.error.code).toBe('BUS_DOUBLE_BOOKED');
    });
  });

  describe('editing', () => {
    it('emails confirmed passengers when the time moves, and keeps their price', async () => {
      const trip = (
        await call('post', '/trips')
          .send(
            fixedTrip({ departureAt: minutesFromNow(72 * 60).toISOString() }),
          )
          .expect(201)
      ).body;
      const { hold } = await buyOnline(trip.id, '1');

      const moved = await call('patch', `/trips/${trip.id}`)
        .send({
          departureAt: minutesFromNow(73 * 60).toISOString(),
          farePesewas: 9_000,
        })
        .expect(200);
      expect(moved.body).toMatchObject({
        farePesewas: 9_000,
        passengersEmailed: 1,
      });

      expect(
        await prisma.outboundMessage.findFirst({
          where: { bookingId: hold.holdId, template: 'trip-changed' },
        }),
      ).toMatchObject({
        status: 'SENT',
        subject: expect.stringMatching(/bus now leaves/),
      });
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: hold.holdId },
      });
      expect(booking.totalPesewas).toBe(5100);
    });

    it('needs the same layout once seats are booked', async () => {
      const trip = (
        await call('post', '/trips')
          .send(
            fixedTrip({ departureAt: minutesFromNow(96 * 60).toISOString() }),
          )
          .expect(201)
      ).body;
      await buyOnline(trip.id, '2');
      const cells: LayoutCell[] = [
        { r: 0, c: 0, type: 'DRIVER' },
        { r: 1, c: 0, type: 'SEAT', label: '1' },
      ];
      const layout = (
        await call('post', '/layouts')
          .send({ name: 'Single', rows: 2, cols: 1, cells })
          .expect(201)
      ).body;
      const smallBus = (
        await call('post', '/buses')
          .send({
            plate: `SM ${fx.suffix}`,
            type: 'MINIBUS',
            layoutId: layout.id,
          })
          .expect(201)
      ).body;

      const res = await call('patch', `/trips/${trip.id}`)
        .send({ busId: smallBus.id })
        .expect(409);
      expect(res.body.error.code).toBe('LAYOUT_MISMATCH');
    });

    it('locks departed trips', async () => {
      const gone = await fx.createTrip({
        status: 'DEPARTED',
        departureAt: minutesFromNow(-120),
      });
      const res = await call('patch', `/trips/${gone.id}`)
        .send({ farePesewas: 1 })
        .expect(409);
      expect(res.body.error.code).toBe('TRIP_LOCKED');
    });
  });

  describe('cancelling', () => {
    it('refunds online tickets, lists cash ones and emails everyone', async () => {
      const trip = (
        await call('post', '/trips')
          .send(
            fixedTrip({ departureAt: minutesFromNow(120 * 60).toISOString() }),
          )
          .expect(201)
      ).body;
      const online = await buyOnline(trip.id, '1');
      const pending = await buyOnline(trip.id, '2', false);

      // A cash walk-in on the same bus
      const cash = await fx.createBooking(trip.id, '3', 'CONFIRMED');
      await prisma.booking.update({
        where: { id: cash.id },
        data: {
          channel: 'WALK_IN',
          passengerName: 'Yaw',
          contactEmail: `cash@${fx.suffix}.test`,
        },
      });
      await prisma.payment.create({
        data: {
          bookingId: cash.id,
          method: 'CASH',
          provider: 'CASH',
          providerRef: `cash_${fx.suffix}`,
          status: 'SUCCESS',
          amountPesewas: cash.totalPesewas,
        },
      });

      const res = await call('post', `/trips/${trip.id}/cancel`)
        .send({ reason: 'Bus broke down' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        refundsPending: 1,
        cashToRepay: [
          { code: cash.code, seatLabel: '3', passengerName: 'Yaw' },
        ],
        passengersEmailed: 2,
      });

      const status = async (id: string) =>
        (await prisma.booking.findUniqueOrThrow({ where: { id } })).status;
      expect(await status(online.hold.holdId)).toBe('REFUND_PENDING');
      expect(await status(cash.id)).toBe('CANCELLED');
      expect(await status(pending.hold.holdId)).toBe('CANCELLED');

      const { providerRef } = await prisma.payment.findUniqueOrThrow({
        where: { id: online.paymentId },
      });
      expect(fake.refunds).toContain(providerRef);
      expect(
        await prisma.outboundMessage.count({
          where: { template: 'trip-cancelled', booking: { tripId: trip.id } },
        }),
      ).toBe(2);

      // The payment that was still pending lands after the cancellation
      const late = await request(app.getHttpServer())
        .post(`/api/v1/payments/${pending.paymentId}/verify`)
        .set('X-Hold-Token', pending.hold.holdToken)
        .expect(200);
      expect(late.body).toMatchObject({
        status: 'SUCCESS',
        bookingStatus: 'REFUND_PENDING',
      });
      expect(
        (await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } }))
          .status,
      ).toBe('CANCELLED');

      const again = await call('post', `/trips/${trip.id}/cancel`)
        .send({ reason: 'Twice' })
        .expect(409);
      expect(again.body.error.code).toBe('TRIP_LOCKED');
    });
  });

  describe('lists and overview', () => {
    it('lists the day’s trips and sums the day', async () => {
      const when = minutesFromNow(144 * 60);
      const trip = (
        await call('post', '/trips')
          .send(fixedTrip({ departureAt: when.toISOString() }))
          .expect(201)
      ).body;
      await buyOnline(trip.id, '4');

      const list = await call('get', `/trips?date=${day(when)}`).expect(200);
      expect(list.body.items.map((t: { id: string }) => t.id)).toContain(
        trip.id,
      );

      const overview = await call('get', `/overview?date=${day(when)}`).expect(
        200,
      );
      expect(overview.body).toMatchObject({
        ticketsSold: 1,
        revenuePesewas: 5100,
        trips: [
          expect.objectContaining({
            id: trip.id,
            sold: 1,
            revenuePesewas: 5100,
          }),
        ],
      });
    });
  });
});
