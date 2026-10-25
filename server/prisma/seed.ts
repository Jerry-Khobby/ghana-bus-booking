// Demo data for local development: Coastline Express as the design shows it.
// Rerunnable: it empties every table first. Run with `npm run db:seed`.
//
// Trip times are relative to when the seed runs, so the statuses always make
// sense: two buses are loading now, two leave later today, one left this
// morning and one leaves tomorrow at 07:00.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateTicketCode } from '../src/bookings/ticket-code.js';
import {
  BookingChannel,
  BookingStatus,
  BusStatus,
  BusType,
  CellType,
  DepartureMode,
  MomoNetwork,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PrismaClient,
  SeatStatus,
  StaffRole,
  StaffStatus,
  TripStatus,
  type Prisma,
} from '../src/generated/prisma/client.js';
import {
  seatsFromLayout,
  type LayoutCell,
  type LayoutSnapshot,
} from '../src/trips/trip-seats.js';

type Tx = Prisma.TransactionClient;

const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword || seedPassword.length < 10) {
  throw new Error('Set SEED_PASSWORD (10 or more characters) in .env');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed: NODE_ENV is production');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const NOW = new Date();
const minutesFromNow = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000);
const utcDay = (daysFromToday: number, hours = 0) =>
  new Date(
    Date.UTC(
      NOW.getUTCFullYear(),
      NOW.getUTCMonth(),
      NOW.getUTCDate() + daysFromToday,
      hours,
    ),
  );

// ─── Layouts ─────────────────────────────────────────────────────────────────

interface CoachShape {
  left: number;
  right: number;
  rows: number;
  backRow: boolean;
}

/**
 * Builds the grid the client's layout editor draws: driver and door across
 * the front, an aisle between the left and right seats, and an optional back
 * row that runs across the aisle too. Seats are numbered front to back, left
 * to right, the same as the client's seat map.
 */
function coachLayout({ left, right, rows, backRow }: CoachShape) {
  const cols = left + 1 + right;
  const totalRows = 1 + rows + (backRow ? 1 : 0);
  const cells: LayoutCell[] = [];
  let label = 1;

  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0) {
        const type =
          c === 0
            ? CellType.DRIVER
            : c === cols - 1
              ? CellType.DOOR
              : CellType.EMPTY;
        cells.push({ r, c, type });
      } else if (c === left && r <= rows) {
        cells.push({ r, c, type: CellType.AISLE });
      } else {
        cells.push({ r, c, type: CellType.SEAT, label: String(label++) });
      }
    }
  }

  const snapshot: LayoutSnapshot = { rows: totalRows, cols, cells };
  return { snapshot, seatCount: label - 1 };
}

const LAYOUTS = {
  acCoach: {
    name: 'AC coach — standard',
    ...coachLayout({ left: 2, right: 2, rows: 11, backRow: true }), // 49 seats
  },
  standard: {
    name: 'Standard bus 2+3',
    ...coachLayout({ left: 2, right: 3, rows: 11, backRow: true }), // 61 seats
  },
  minibus: {
    name: 'Minibus 2+1',
    ...coachLayout({ left: 2, right: 1, rows: 6, backRow: false }), // 18 seats
  },
};

// ─── Reference data ──────────────────────────────────────────────────────────

const STATIONS = {
  circle: { name: 'Circle', city: 'Accra', region: 'Greater Accra' },
  asafo: { name: 'Asafo', city: 'Kumasi', region: 'Ashanti' },
  capeCoast: { name: 'Main station', city: 'Cape Coast', region: 'Central' },
  takoradi: { name: 'Main station', city: 'Takoradi', region: 'Western' },
  tamale: { name: 'Main station', city: 'Tamale', region: 'Northern' },
  ho: { name: 'Main station', city: 'Ho', region: 'Volta' },
};
type StationKey = keyof typeof STATIONS;

// Bays Coastline Express uses at each station
const BAYS: Partial<Record<StationKey, number>> = {
  circle: 8,
  asafo: 4,
  capeCoast: 2,
};

const ROUTES = {
  kumasi: { to: 'asafo', farePesewas: 15_000, durationMinutes: 270 },
  capeCoast: { to: 'capeCoast', farePesewas: 9_000, durationMinutes: 150 },
  takoradi: { to: 'takoradi', farePesewas: 13_000, durationMinutes: 240 },
  tamale: { to: 'tamale', farePesewas: 28_000, durationMinutes: 720 },
} satisfies Record<
  string,
  { to: StationKey; farePesewas: number; durationMinutes: number }
>;
type RouteKey = keyof typeof ROUTES;

const BUSES = [
  { plate: 'GR 4471-24', type: BusType.AC_COACH, layout: 'acCoach' },
  { plate: 'GR 1190-25', type: BusType.AC_COACH, layout: 'acCoach' },
  { plate: 'GW 2290-23', type: BusType.AC_COACH, layout: 'acCoach' },
  { plate: 'GR 3015-24', type: BusType.AC_COACH, layout: 'acCoach' },
  { plate: 'GR 7742-25', type: BusType.AC_COACH, layout: 'acCoach' },
  {
    plate: 'GR 6610-21',
    type: BusType.STANDARD,
    layout: 'standard',
    inWorkshop: true,
  },
] as const;

interface StaffSeed {
  email: string;
  name: string;
  role: StaffRole;
  station?: StationKey;
  bays?: number[];
  invited?: boolean;
}

const STAFF: StaffSeed[] = [
  {
    email: 'admin@coastline.example',
    name: 'Adwoa B.',
    role: StaffRole.OPERATOR_ADMIN,
  },
  {
    email: 'kofi.a@coastline.example',
    name: 'Kofi A.',
    role: StaffRole.AGENT,
    station: 'circle',
    bays: [4, 5, 6],
  },
  {
    email: 'akosua.m@coastline.example',
    name: 'Akosua M.',
    role: StaffRole.AGENT,
    station: 'circle',
    bays: [1, 2, 3],
  },
  {
    email: 'yaw.d@coastline.example',
    name: 'Yaw D.',
    role: StaffRole.AGENT,
    station: 'asafo',
    bays: [1, 2, 3, 4],
  },
  {
    email: 'esi.t@coastline.example',
    name: 'Esi T.',
    role: StaffRole.AGENT,
    station: 'capeCoast',
    bays: [1, 2],
  },
  {
    email: 'kwame.o@coastline.example',
    name: 'Kwame O.',
    role: StaffRole.AGENT,
    station: 'circle',
    bays: [7, 8],
    invited: true,
  },
];

const PASSENGER_NAMES = [
  'Ama Mensah',
  'Kwesi Boateng',
  'Efua Asante',
  'Yaw Owusu',
  'Akua Darko',
  'Kojo Addo',
  'Abena Ofori',
  'Kwabena Appiah',
];

// ─── Trips ───────────────────────────────────────────────────────────────────

interface TripSpec {
  plate: string;
  route: RouteKey;
  bay: number; // at Circle
  mode: DepartureMode;
  status: TripStatus;
  loadingStartsAt: Date;
  departureAt?: Date;
  leaveBy?: Date;
  departedAt?: Date;
  sold: number;
  /** HELD seats whose hold already ran out: they must show as available. */
  expiredHolds?: number;
  /** HELD seats someone is paying for right now. */
  activeHolds?: number;
}

const TRIPS: TripSpec[] = [
  {
    plate: 'GR 4471-24',
    route: 'kumasi',
    bay: 6,
    mode: DepartureMode.WHEN_FULL,
    status: TripStatus.LOADING,
    loadingStartsAt: minutesFromNow(-40),
    leaveBy: minutesFromNow(80),
    sold: 41,
    expiredHolds: 1,
    activeHolds: 1,
  },
  {
    plate: 'GR 1190-25',
    route: 'kumasi',
    bay: 6,
    mode: DepartureMode.FIXED_TIME,
    status: TripStatus.SCHEDULED,
    departureAt: minutesFromNow(150),
    loadingStartsAt: minutesFromNow(90),
    sold: 27,
  },
  {
    plate: 'GW 2290-23',
    route: 'capeCoast',
    bay: 2,
    mode: DepartureMode.WHEN_FULL,
    status: TripStatus.LOADING,
    loadingStartsAt: minutesFromNow(-25),
    leaveBy: minutesFromNow(95),
    sold: 22,
    expiredHolds: 2,
  },
  {
    plate: 'GR 3015-24',
    route: 'takoradi',
    bay: 3,
    mode: DepartureMode.FIXED_TIME,
    status: TripStatus.SCHEDULED,
    departureAt: minutesFromNow(210),
    loadingStartsAt: minutesFromNow(150),
    sold: 12,
  },
  {
    plate: 'GR 7742-25',
    route: 'tamale',
    bay: 1,
    mode: DepartureMode.FIXED_TIME,
    status: TripStatus.DEPARTED,
    departureAt: minutesFromNow(-300),
    loadingStartsAt: minutesFromNow(-360),
    departedAt: minutesFromNow(-295),
    sold: 46,
  },
  {
    plate: 'GR 4471-24',
    route: 'kumasi',
    bay: 6,
    mode: DepartureMode.FIXED_TIME,
    status: TripStatus.SCHEDULED,
    departureAt: utcDay(1, 7),
    loadingStartsAt: utcDay(1, 6),
    sold: 0,
  },
];

/** Deterministic shuffle, so every run sells the same seats on each trip. */
function shuffled<T>(items: T[], seed: string): T[] {
  let state = [...seed].reduce(
    (h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16_777_619),
    2_166_136_261,
  );
  const random = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface SeedContext {
  operator: { id: string; serviceFeePesewas: number };
  adminId: string;
  boardingAgentId: string;
  busIds: Map<string, string>;
  layoutByPlate: Map<string, (typeof LAYOUTS)[keyof typeof LAYOUTS]>;
  routes: Map<RouteKey, { id: string; farePesewas: number }>;
  circleBayIds: Map<number, string>;
}

async function createTrip(
  tx: Tx,
  spec: TripSpec,
  index: number,
  ctx: SeedContext,
) {
  const layout = ctx.layoutByPlate.get(spec.plate)!;
  const route = ctx.routes.get(spec.route)!;
  const departed = spec.status === TripStatus.DEPARTED;

  const trip = await tx.trip.create({
    data: {
      operatorId: ctx.operator.id,
      routeId: route.id,
      busId: ctx.busIds.get(spec.plate)!,
      bayId: ctx.circleBayIds.get(spec.bay)!,
      mode: spec.mode,
      status: spec.status,
      departureAt: spec.departureAt,
      loadingStartsAt: spec.loadingStartsAt,
      leaveBy: spec.leaveBy,
      departedAt: spec.departedAt,
      farePesewas: route.farePesewas,
      seatsTotal: layout.seatCount,
      seatsSold: spec.sold,
      layoutSnapshot: layout.snapshot as unknown as Prisma.InputJsonValue,
      createdById: ctx.adminId,
    },
  });

  // Pick which seats are sold or held
  const seats = seatsFromLayout(layout.snapshot.cells);
  const order = shuffled(
    seats.map((s) => s.label),
    `${spec.plate}#${index}`,
  );
  const sold = new Set(order.slice(0, spec.sold));
  const expired = new Set(
    order.slice(spec.sold, spec.sold + (spec.expiredHolds ?? 0)),
  );
  const active = new Set(
    order.slice(
      spec.sold + expired.size,
      spec.sold + expired.size + (spec.activeHolds ?? 0),
    ),
  );
  const holdExpiresAt = (label: string) =>
    expired.has(label)
      ? minutesFromNow(-3)
      : active.has(label)
        ? minutesFromNow(4)
        : null;

  const tripSeats = await tx.tripSeat.createManyAndReturn({
    data: seats.map((seat) => ({
      ...seat,
      tripId: trip.id,
      status: sold.has(seat.label)
        ? SeatStatus.SOLD
        : expired.has(seat.label) || active.has(seat.label)
          ? SeatStatus.HELD
          : SeatStatus.AVAILABLE,
      holdExpiresAt: holdExpiresAt(seat.label),
    })),
    select: { id: true, label: true },
  });

  // One booking per sold or held seat
  const fee = ctx.operator.serviceFeePesewas;
  const booked = tripSeats.filter(
    (s) => sold.has(s.label) || expired.has(s.label) || active.has(s.label),
  );
  const bookings = await tx.booking.createManyAndReturn({
    data: booked.map((seat, i) => {
      const name = PASSENGER_NAMES[i % PASSENGER_NAMES.length];
      const isSold = sold.has(seat.label);
      // On the departed trip two passengers never turned up
      const status = !isSold
        ? BookingStatus.HELD
        : departed
          ? i < 2
            ? BookingStatus.NO_SHOW
            : BookingStatus.BOARDED
          : BookingStatus.CONFIRMED;
      const confirmedAt = isSold
        ? new Date(spec.loadingStartsAt.getTime() - (i + 10) * 60_000)
        : null;
      return {
        code: generateTicketCode(),
        operatorId: ctx.operator.id,
        tripId: trip.id,
        tripSeatId: seat.id,
        seatLabel: seat.label,
        contactEmail: `${name.toLowerCase().replace(' ', '.')}.${index}${i}@example.com`,
        passengerName: name,
        channel: BookingChannel.ONLINE,
        status,
        farePesewas: route.farePesewas,
        feePesewas: fee,
        totalPesewas: route.farePesewas + fee,
        holdExpiresAt: holdExpiresAt(seat.label),
        confirmedAt,
        boardedAt:
          status === BookingStatus.BOARDED
            ? new Date(spec.departedAt!.getTime() - 10 * 60_000)
            : null,
        boardedById:
          status === BookingStatus.BOARDED ? ctx.boardingAgentId : null,
        qrNonce: randomBytes(16).toString('base64url'),
      };
    }),
    select: {
      id: true,
      code: true,
      status: true,
      totalPesewas: true,
      confirmedAt: true,
    },
  });

  // Sold seats were paid for by mobile money through the fake provider
  await tx.payment.createMany({
    data: bookings
      .filter((b) => b.status !== BookingStatus.HELD)
      .map((b) => ({
        bookingId: b.id,
        method: PaymentMethod.MOMO,
        network: MomoNetwork.MTN,
        payerPhone: '+233241234567',
        amountPesewas: b.totalPesewas,
        provider: PaymentProvider.FAKE,
        providerRef: `seed-${b.code}`,
        status: PaymentStatus.SUCCESS,
        paidAt: b.confirmedAt,
      })),
  });

  // Point each taken seat at its booking
  await tx.$executeRaw`
    UPDATE "TripSeat" s SET "bookingId" = b.id
    FROM "Booking" b
    WHERE b."tripSeatId" = s.id AND b."tripId" = ${trip.id}::uuid`;

  return bookings.length;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function clearDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

async function seed(tx: Tx) {
  const operator = await tx.operator.create({
    data: {
      name: 'Coastline Express',
      slug: 'coastline-express',
      phone: '+233302000000',
      email: 'hello@coastline.example',
      serviceFeePesewas: 100,
      holdMinutes: 5,
    },
  });

  const stationIds = new Map<StationKey, string>();
  for (const [key, station] of Object.entries(STATIONS)) {
    const { id } = await tx.station.create({ data: station });
    stationIds.set(key as StationKey, id);
  }

  const bayIds = new Map<string, string>(); // "circle:6" -> id
  for (const [station, count] of Object.entries(BAYS)) {
    for (let number = 1; number <= count; number++) {
      const { id } = await tx.bay.create({
        data: {
          operatorId: operator.id,
          stationId: stationIds.get(station as StationKey)!,
          number,
        },
      });
      bayIds.set(`${station}:${number}`, id);
    }
  }

  const layoutIds = new Map<string, string>();
  for (const [key, layout] of Object.entries(LAYOUTS)) {
    const { id } = await tx.seatLayout.create({
      data: {
        operatorId: operator.id,
        name: layout.name,
        rows: layout.snapshot.rows,
        cols: layout.snapshot.cols,
        cells: layout.snapshot.cells as unknown as Prisma.InputJsonValue,
        seatCount: layout.seatCount,
      },
    });
    layoutIds.set(key, id);
  }

  const busIds = new Map<string, string>();
  const layoutByPlate = new Map<
    string,
    (typeof LAYOUTS)[keyof typeof LAYOUTS]
  >();
  for (const bus of BUSES) {
    const inWorkshop = 'inWorkshop' in bus && bus.inWorkshop;
    const { id } = await tx.bus.create({
      data: {
        operatorId: operator.id,
        plate: bus.plate,
        type: bus.type,
        layoutId: layoutIds.get(bus.layout)!,
        status: inWorkshop ? BusStatus.IN_WORKSHOP : BusStatus.ACTIVE,
        backInServiceOn: inWorkshop ? utcDay(2) : null,
      },
    });
    busIds.set(bus.plate, id);
    layoutByPlate.set(bus.plate, LAYOUTS[bus.layout]);
  }

  const routes = new Map<RouteKey, { id: string; farePesewas: number }>();
  for (const [key, route] of Object.entries(ROUTES)) {
    const { id } = await tx.route.create({
      data: {
        operatorId: operator.id,
        originStationId: stationIds.get('circle')!,
        destinationStationId: stationIds.get(route.to)!,
        baseFarePesewas: route.farePesewas,
        durationMinutes: route.durationMinutes,
      },
    });
    routes.set(key as RouteKey, { id, farePesewas: route.farePesewas });
  }

  const staffIds = new Map<string, string>();
  for (const member of STAFF) {
    const { id } = await tx.staffUser.create({
      data: {
        operatorId: operator.id,
        role: member.role,
        email: member.email,
        name: member.name,
        // Invited staff set their password when they accept the invite
        passwordHash: member.invited ? null : await hash(seedPassword!),
        status: member.invited ? StaffStatus.INVITED : StaffStatus.ACTIVE,
        stationId: member.station ? stationIds.get(member.station) : null,
        bays: member.bays
          ? {
              create: member.bays.map((n) => ({
                bayId: bayIds.get(`${member.station}:${n}`)!,
              })),
            }
          : undefined,
      },
    });
    staffIds.set(member.email, id);
  }

  await tx.staffUser.create({
    data: {
      role: StaffRole.PLATFORM_ADMIN,
      email: 'platform@seatline.example',
      name: 'Seatline Platform',
      passwordHash: await hash(seedPassword!),
      status: StaffStatus.ACTIVE,
    },
  });

  const ctx: SeedContext = {
    operator,
    adminId: staffIds.get('admin@coastline.example')!,
    boardingAgentId: staffIds.get('akosua.m@coastline.example')!, // bays 1–3
    busIds,
    layoutByPlate,
    routes,
    circleBayIds: new Map(
      [...bayIds]
        .filter(([key]) => key.startsWith('circle:'))
        .map(([key, id]) => [Number(key.split(':')[1]), id]),
    ),
  };

  let bookings = 0;
  for (const [index, spec] of TRIPS.entries()) {
    bookings += await createTrip(tx, spec, index, ctx);
  }

  return { trips: TRIPS.length, bookings, staff: STAFF.length + 1 };
}

async function main() {
  await clearDatabase();
  const counts = await prisma.$transaction(seed, { timeout: 60_000 });
  console.log(
    `Seeded Coastline Express: ${counts.trips} trips, ${counts.bookings} bookings, ` +
      `${counts.staff} staff. Staff sign in with SEED_PASSWORD.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
