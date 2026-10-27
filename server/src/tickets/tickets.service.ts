import { HttpStatus, Injectable } from '@nestjs/common';
import { holdTokenMatches } from '../bookings/hold-token.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BookingStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TripsService } from '../trips/trips.service.js';
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
    if (!access.t && !access.holdToken) {
      throw new AppException(
        'UNAUTHENTICATED',
        'Open the ticket from its link, or send the X-Hold-Token you paid with',
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
    if (
      !access.t &&
      !(
        booking.holdTokenHash &&
        holdTokenMatches(access.holdToken!, booking.holdTokenHash)
      )
    ) {
      throw ticketNotFound();
    }
    return booking;
  }
}

function ticketNotFound() {
  return new AppException(
    'NOT_FOUND',
    'Ticket not found',
    HttpStatus.NOT_FOUND,
  );
}

function requireSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} in .env (any long random string)`);
  }
  return value;
}
