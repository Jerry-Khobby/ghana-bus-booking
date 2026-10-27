import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { generateTicketCode } from './../src/bookings/ticket-code.js';
import type { Prisma } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import type { LayoutCell } from './../src/trips/trip-seats.js';

export async function createTestApp() {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication<App> = moduleFixture.createNestApplication({
    rawBody: true,
  });
  app.setGlobalPrefix('api/v1');
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** A day from today as YYYY-MM-DD (UTC, which is Ghana time). */
export function isoDay(daysFromToday: number) {
  return new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export const minutesFromNow = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000);

// A tiny 2 × 3 bus: seats 1 and 2 at the front, 3 and 4 behind, aisle between
export const CELLS: LayoutCell[] = [
  { r: 0, c: 0, type: 'SEAT', label: '1' },
  { r: 0, c: 1, type: 'AISLE' },
  { r: 0, c: 2, type: 'SEAT', label: '2' },
  { r: 1, c: 0, type: 'SEAT', label: '3' },
  { r: 1, c: 1, type: 'AISLE' },
  { r: 1, c: 2, type: 'SEAT', label: '4' },
];
const SEATS = [
  { label: '1', row: 0, col: 0 },
  { label: '2', row: 0, col: 2 },
  { label: '3', row: 1, col: 0 },
  { label: '4', row: 1, col: 2 },
];

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

/**
 * An operator of its own with two stations, two bays, one 4-seat minibus and
 * one route, so e2e tests never depend on (or disturb) the seed data.
 * Call cleanup() in afterAll.
 */
export async function createFixture(prisma: PrismaService) {
  const suffix = randomUUID().slice(0, 8);

  const operator = await prisma.operator.create({
    data: { name: `Test Lines ${suffix}`, slug: `test-${suffix}` },
  });
  const origin = await prisma.station.create({
    data: { name: 'North', city: `Testville ${suffix}`, region: 'Test' },
  });
  const destination = await prisma.station.create({
    data: { name: 'South', city: `Testtown ${suffix}`, region: 'Test' },
  });
  const layout = await prisma.seatLayout.create({
    data: {
      operatorId: operator.id,
      name: 'Tiny',
      rows: 2,
      cols: 3,
      cells: CELLS as unknown as Prisma.InputJsonValue,
      seatCount: SEATS.length,
    },
  });
  const bus = await prisma.bus.create({
    data: {
      operatorId: operator.id,
      plate: `TT ${suffix}`,
      type: 'MINIBUS',
      layoutId: layout.id,
    },
  });
  const bays = await Promise.all(
    [1, 2].map((number) =>
      prisma.bay.create({
        data: { operatorId: operator.id, stationId: origin.id, number },
      }),
    ),
  );
  const route = await prisma.route.create({
    data: {
      operatorId: operator.id,
      originStationId: origin.id,
      destinationStationId: destination.id,
      baseFarePesewas: 5000,
    },
  });
  const admin = await prisma.staffUser.create({
    data: {
      operatorId: operator.id,
      role: 'OPERATOR_ADMIN',
      email: `admin-${suffix}@test.example`,
      name: 'Test Admin',
    },
  });

  /** A fixed-time trip on bay 1 with four free seats, unless overridden. */
  const createTrip = (data: Partial<Prisma.TripUncheckedCreateInput> = {}) =>
    prisma.trip.create({
      data: {
        operatorId: operator.id,
        routeId: route.id,
        busId: bus.id,
        bayId: bays[0].id,
        mode: 'FIXED_TIME',
        farePesewas: 5000,
        seatsTotal: SEATS.length,
        layoutSnapshot: {
          rows: 2,
          cols: 3,
          cells: CELLS,
        } as unknown as Prisma.InputJsonValue,
        createdById: admin.id,
        ...data,
        seats: { create: SEATS },
      },
    });

  const setSeat = (
    tripId: string,
    label: string,
    data: Prisma.TripSeatUncheckedUpdateManyInput,
  ) => prisma.tripSeat.updateMany({ where: { tripId, label }, data });

  /** A booking on one seat, with the seat pointing at it (SOLD or HELD). */
  async function createBooking(
    tripId: string,
    seatLabel: string,
    status: 'CONFIRMED' | 'HELD' | 'PENDING_PAYMENT',
    holdExpiresAt: Date | null = null,
  ) {
    const seat = await prisma.tripSeat.findUniqueOrThrow({
      where: { tripId_label: { tripId, label: seatLabel } },
    });
    const booking = await prisma.booking.create({
      data: {
        // A real code: the ticket endpoints reject anything that isn't one
        code: generateTicketCode(),
        operatorId: operator.id,
        tripId,
        tripSeatId: seat.id,
        seatLabel,
        channel: 'ONLINE',
        status,
        farePesewas: 5000,
        feePesewas: 100,
        totalPesewas: 5100,
        holdExpiresAt,
        qrNonce: randomUUID(),
      },
    });
    await prisma.tripSeat.update({
      where: { id: seat.id },
      data: {
        status: status === 'CONFIRMED' ? 'SOLD' : 'HELD',
        holdExpiresAt,
        bookingId: booking.id,
      },
    });
    return booking;
  }

  async function cleanup() {
    const operatorId = operator.id;
    const trips = { trip: { operatorId } };
    await prisma.tripSeat.updateMany({
      where: trips,
      data: { bookingId: null },
    });
    await prisma.payment.deleteMany({ where: { booking: { operatorId } } });
    await prisma.booking.deleteMany({ where: { operatorId } });
    await prisma.trip.deleteMany({ where: { operatorId } }); // seats cascade
    await prisma.route.deleteMany({ where: { operatorId } });
    await prisma.bay.deleteMany({ where: { operatorId } });
    await prisma.bus.deleteMany({ where: { operatorId } });
    await prisma.seatLayout.deleteMany({ where: { operatorId } });
    await prisma.staffUser.deleteMany({ where: { operatorId } });
    await prisma.operator.delete({ where: { id: operatorId } });
    await prisma.station.deleteMany({
      where: { id: { in: [origin.id, destination.id] } },
    });
  }

  return {
    suffix,
    operator,
    origin,
    destination,
    bus,
    bays,
    route,
    admin,
    createTrip,
    setSeat,
    createBooking,
    cleanup,
  };
}
