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

// Trip statuses follow the clock lazily: reading a trip brings it up to date.
describe('Trip status refresh (e2e)', () => {
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

  const read = (tripId: string) =>
    request(app.getHttpServer()).get(`/api/v1/trips/${tripId}`).expect(200);
  const statusOf = async (tripId: string) =>
    (await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).status;

  it('starts loading once loadingStartsAt has passed', async () => {
    const trip = await fx.createTrip({
      bayId: fx.bays[1].id,
      loadingStartsAt: minutesFromNow(-5),
      departureAt: minutesFromNow(55),
    });

    const res = await read(trip.id);
    expect(res.body.status).toBe('LOADING');
  });

  it('waits while another bus is loading at the same bay', async () => {
    await fx.createTrip({
      mode: 'WHEN_FULL',
      status: 'LOADING',
      loadingStartsAt: minutesFromNow(-30),
    });
    const next = await fx.createTrip({
      loadingStartsAt: minutesFromNow(-5),
      departureAt: minutesFromNow(55),
    });

    const res = await read(next.id);
    expect(res.body.status).toBe('SCHEDULED');
  });

  it('departs a fixed-time trip 30 minutes after its departure time', async () => {
    const trip = await fx.createTrip({
      bayId: fx.bays[1].id,
      status: 'LOADING',
      loadingStartsAt: minutesFromNow(-100),
      departureAt: minutesFromNow(-40),
    });
    const confirmed = await fx.createBooking(trip.id, '1', 'CONFIRMED');
    const held = await fx.createBooking(
      trip.id,
      '2',
      'HELD',
      minutesFromNow(3),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/trips/${trip.id}/seats`)
      .expect(200);

    const after = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
    });
    expect(after.status).toBe('DEPARTED');
    expect(after.departedAt).toEqual(trip.departureAt);

    const bookings = await prisma.booking.findMany({
      where: { id: { in: [confirmed.id, held.id] } },
      select: { id: true, status: true },
    });
    expect(Object.fromEntries(bookings.map((b) => [b.id, b.status]))).toEqual({
      [confirmed.id]: 'NO_SHOW',
      [held.id]: 'EXPIRED',
    });
    const seat2 = await prisma.tripSeat.findFirstOrThrow({
      where: { tripId: trip.id, label: '2' },
    });
    expect(seat2).toMatchObject({ status: 'AVAILABLE', bookingId: null });
  });

  it('keeps loading inside the 30-minute grace and for fill-and-go trips', async () => {
    const late = await fx.createTrip({
      bayId: fx.bays[1].id,
      status: 'LOADING',
      loadingStartsAt: minutesFromNow(-70),
      departureAt: minutesFromNow(-10),
    });
    const whenFull = await fx.createTrip({
      bayId: fx.bays[1].id,
      mode: 'WHEN_FULL',
      status: 'LOADING',
      loadingStartsAt: minutesFromNow(-300),
    });

    await read(late.id);
    await read(whenFull.id);
    expect(await statusOf(late.id)).toBe('LOADING');
    expect(await statusOf(whenFull.id)).toBe('LOADING');
  });
});
