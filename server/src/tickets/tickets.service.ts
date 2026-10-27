import { HttpStatus, Injectable } from '@nestjs/common';
import { ownsBooking } from '../bookings/hold-token.js';
import type { AuthUser } from '../common/auth/auth-user.js';
import { AppException } from '../common/errors/app.exception.js';
import { requireSecret } from '../common/secrets.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BookingStatus, TripStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isStatusStale, TripsService } from '../trips/trips.service.js';
import { renderTicketPdf } from './ticket-pdf.js';
import {
  checkTicketLink,
  signQrPayload,
  signTicketLink,
} from './ticket-signing.js';

/** Only these bookings are tickets; anything else is NOT_FOUND. */
const TICKET_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.BOARDED,
  BookingStatus.NO_SHOW,
];

/** Ticket links keep working this long after the trip. */
const LINK_VALID_AFTER_TRIP_MS = 7 * 24 * 60 * 60 * 1000;

// Booking codes look like SL-7Q4K-2M; anything else can't be a ticket
const CODE_PATTERN = /^SL-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{2}$/;

const ticketSelect = {
  code: true,
  status: true,
  tripId: true,
  seatLabel: true,
  passengerName: true,
  totalPesewas: true,
  qrNonce: true,
  holdTokenHash: true,
  passengerId: true,
  boardedAt: true,
  trip: {
    select: {
      status: true,
      mode: true,
      departureAt: true,
      loadingStartsAt: true,
      leaveBy: true,
      operator: { select: { name: true, phone: true } },
      bus: { select: { plate: true, type: true } },
      bay: { select: { number: true } },
      route: {
        select: {
          durationMinutes: true,
          originStation: { select: { name: true, city: true } },
          destinationStation: { select: { name: true, city: true } },
        },
      },
    },
  },
} satisfies Prisma.BookingSelect;

/** How someone proves they may see a ticket. */
export interface TicketAccess {
  /** The `t` from the emailed ticket link. */
  t?: string;
  /** The hold token from POST /holds, right after paying. */
  holdToken?: string;
  /** The signed-in caller; a passenger opens their own tickets. */
  user?: AuthUser;
}

export type Ticket = Awaited<ReturnType<TicketsService['getTicket']>>;

@Injectable()
export class TicketsService {
  private readonly qrSecret = requireSecret('QR_SIGNING_SECRET');
  private readonly linkSecret = requireSecret('TICKET_LINK_SECRET');

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
  ) {}

  /** The `t` for a ticket link, valid until 7 days after the trip. */
  linkToken(
    code: string,
    trip: {
      departureAt: Date | null;
      leaveBy: Date | null;
      loadingStartsAt: Date | null;
    },
  ): string {
    const tripTime =
      trip.departureAt ?? trip.leaveBy ?? trip.loadingStartsAt ?? new Date();
    return signTicketLink(
      this.linkSecret,
      code,
      new Date(tripTime.getTime() + LINK_VALID_AFTER_TRIP_MS),
    );
  }

  qrPayload(booking: { code: string; tripId: string; qrNonce: string }) {
    return signQrPayload(this.qrSecret, booking);
  }

  /** GET /tickets/:code: everything the "Your ticket" screen shows. */
  async getTicket(code: string, access: TicketAccess) {
    const booking = await this.loadTicket(code, access);
    const { trip } = booking;
    return {
      code: booking.code,
      status: booking.status,
      seatLabel: booking.seatLabel,
      passengerName: booking.passengerName,
      totalPesewas: booking.totalPesewas,
      currency: 'GHS' as const,
      operator: trip.operator,
      route: {
        origin: trip.route.originStation,
        destination: trip.route.destinationStation,
        durationMinutes: trip.route.durationMinutes,
      },
      bus: trip.bus,
      bay: trip.bay,
      tripStatus: trip.status,
      mode: trip.mode,
      departureAt: trip.departureAt,
      loadingStartsAt: trip.loadingStartsAt,
      leaveBy: trip.leaveBy,
      boardedAt: booking.boardedAt,
      qrPayload: this.qrPayload(booking),
    };
  }

  /** GET /tickets/:code/pdf: the same ticket on one printable page. */
  async getTicketPdf(code: string, access: TicketAccess) {
    return renderTicketPdf(await this.getTicket(code, access));
  }

  private async loadTicket(code: string, access: TicketAccess) {
    if (!access.t && !access.holdToken && access.user?.typ !== 'passenger') {
      throw new AppException(
        'UNAUTHENTICATED',
        'Open the ticket from its link, send the X-Hold-Token you paid with, or sign in',
        HttpStatus.UNAUTHORIZED,
      );
    }
    // The link is checked before the database, so it can't be used to probe
    // which codes exist
    if (access.t) {
      const link = checkTicketLink(this.linkSecret, code, access.t);
      if (link !== 'ok') {
        throw new AppException(
          'TOKEN_INVALID',
          link === 'expired'
            ? 'This ticket link has expired'
            : 'This ticket link is not valid',
          HttpStatus.UNAUTHORIZED,
        );
      }
    }
    if (!CODE_PATTERN.test(code)) throw ticketNotFound();

    const found = await this.prisma.booking.findUnique({
      where: { code },
      select: { tripId: true },
    });
    if (!found) throw ticketNotFound();
    // A departed trip turns unboarded tickets into NO_SHOW; show that
    await this.trips.refreshStatus(found.tripId);

    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { code },
      select: ticketSelect,
    });
    if (!TICKET_STATUSES.includes(booking.status)) throw ticketNotFound();
    if (!access.t && !ownsBooking(booking, access.holdToken, access.user)) {
      throw ticketNotFound();
    }
    return booking;
  }

  /**
   * GET /me/tickets. Upcoming: confirmed tickets on trips that haven't left,
   * soonest first. Past: boarded, no-show and confirmed tickets on departed
   * trips, newest first. Cursor-paged by booking id.
   */
  async myTickets(passengerId: string, query: MyTicketsQuery) {
    const upcoming = query.scope !== 'past';
    const where: Prisma.BookingWhereInput = upcoming
      ? {
          passengerId,
          status: BookingStatus.CONFIRMED,
          trip: {
            status: { notIn: [TripStatus.DEPARTED, TripStatus.CANCELLED] },
          },
        }
      : {
          passengerId,
          OR: [
            {
              status: { in: [BookingStatus.BOARDED, BookingStatus.NO_SHOW] },
            },
            {
              status: BookingStatus.CONFIRMED,
              trip: { status: TripStatus.DEPARTED },
            },
          ],
        };
    const direction = upcoming ? 'asc' : 'desc';
    const read = () =>
      this.prisma.booking.findMany({
        where,
        select: myTicketSelect,
        orderBy: [
          { trip: { departureAt: { sort: direction, nulls: 'last' } } },
          { trip: { loadingStartsAt: { sort: direction, nulls: 'last' } } },
          { id: direction },
        ],
        take: query.limit + 1,
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      });

    let rows = await read();
    // A trip that has left since the last look moves its ticket to Past
    const stale = rows.filter((row) => isStatusStale(row.trip, new Date()));
    if (stale.length) {
      for (const row of stale) await this.trips.refreshStatus(row.tripId);
      rows = await read();
    }

    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => ({
        code: row.code,
        status: row.status,
        badge: badgeFor(row.status, row.trip),
        seatLabel: row.seatLabel,
        operator: row.trip.operator,
        route: {
          origin: row.trip.route.originStation,
          destination: row.trip.route.destinationStation,
        },
        bus: row.trip.bus,
        bay: row.trip.bay,
        mode: row.trip.mode,
        departureAt: row.trip.departureAt,
        loadingStartsAt: row.trip.loadingStartsAt,
        leaveBy: row.trip.leaveBy,
      })),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }
}

export interface MyTicketsQuery {
  scope: 'upcoming' | 'past';
  limit: number;
  cursor?: string;
}

const myTicketSelect = {
  id: true,
  code: true,
  status: true,
  tripId: true,
  seatLabel: true,
  trip: {
    select: {
      status: true,
      mode: true,
      departureAt: true,
      loadingStartsAt: true,
      leaveBy: true,
      operator: { select: { name: true } },
      bus: { select: { plate: true } },
      bay: { select: { number: true } },
      route: {
        select: {
          originStation: { select: { name: true, city: true } },
          destinationStation: { select: { name: true, city: true } },
        },
      },
    },
  },
} satisfies Prisma.BookingSelect;

/** The badge each ticket shows on My tickets. */
function badgeFor(
  status: BookingStatus,
  trip: { status: TripStatus; bay: { number: number } },
): string {
  if (status === BookingStatus.BOARDED) return 'Used';
  if (status === BookingStatus.NO_SHOW) return 'Not used';
  switch (trip.status) {
    case TripStatus.LOADING:
    case TripStatus.FULL:
      return `Loading · bay ${trip.bay.number}`;
    case TripStatus.DEPARTED:
      return 'Not used';
    default:
      return 'Scheduled';
  }
}

function ticketNotFound() {
  return new AppException(
    'NOT_FOUND',
    'Ticket not found',
    HttpStatus.NOT_FOUND,
  );
}
