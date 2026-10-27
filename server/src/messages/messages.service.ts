import { Inject, Injectable, Logger } from '@nestjs/common';
import QRCode from 'qrcode';
import type { Prisma } from '../generated/prisma/client.js';
import { MessageChannel, MessageStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { departureLine } from '../common/format.js';
import { MAILER, type EmailMessage, type Mailer } from './mailer.js';
import {
  lateRefundEmail,
  otpEmail,
  staffInviteEmail,
  staffResetEmail,
  ticketEmail,
  tripCancelledEmail,
  tripChangedEmail,
  type RenderedEmail,
  type TemplateName,
} from './templates.js';

type Db = PrismaService | Prisma.TransactionClient;

/** After this many failed sends a message is given up as FAILED. */
const MAX_ATTEMPTS = 5;

const bookingForEmail = {
  id: true,
  code: true,
  tripId: true,
  qrNonce: true,
  seatLabel: true,
  passengerName: true,
  contactEmail: true,
  totalPesewas: true,
  trip: {
    select: {
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

/**
 * The outbox. Emails are written to OutboundMessage inside the same
 * transaction as the change that caused them, so a booking can't be confirmed
 * without its ticket email being recorded. They're sent right after commit
 * (send), and anything that failed is retried by the tick (sendQueued).
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private readonly webUrl = (
    process.env.WEB_URL ?? 'http://localhost:5173'
  ).replace(/\/$/, '');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** Queues a staff invite with its set-password link. */
  queueStaffInvite(
    db: Db,
    to: string,
    data: { name: string; operatorName: string; token: string },
  ) {
    const url = `${this.webUrl}/staff/accept?token=${encodeURIComponent(data.token)}`;
    return this.queue(
      db,
      to,
      'staff-invite',
      staffInviteEmail({ ...data, url }),
    );
  }

  /** Queues a staff password reset link. */
  queueStaffReset(db: Db, to: string, data: { name: string; token: string }) {
    const url = `${this.webUrl}/staff/reset?token=${encodeURIComponent(data.token)}`;
    return this.queue(db, to, 'staff-reset', staffResetEmail({ ...data, url }));
  }

  /** The links an invite or reset email carries, for showing in development. */
  staffLink(kind: 'accept' | 'reset', token: string) {
    return `${this.webUrl}/staff/${kind}?token=${encodeURIComponent(token)}`;
  }

  /** Queues a sign-in code email. */
  queueOtp(db: Db, email: string, code: string, minutesValid: number) {
    return this.queue(db, email, 'otp', otpEmail(code, minutesValid));
  }

  /** Queues the ticket email for a confirmed booking. Null if it has no email. */
  async queueTicket(db: Db, bookingId: string): Promise<string | null> {
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: bookingForEmail,
    });
    if (!booking.contactEmail) return null;
    const { trip } = booking;

    const email = ticketEmail({
      code: booking.code,
      seatLabel: booking.seatLabel,
      passengerName: booking.passengerName,
      totalPesewas: booking.totalPesewas,
      operatorName: trip.operator.name,
      origin: trip.route.originStation,
      destination: trip.route.destinationStation,
      busPlate: trip.bus.plate,
      bayNumber: trip.bay.number,
      mode: trip.mode,
      departureAt: trip.departureAt,
      loadingStartsAt: trip.loadingStartsAt,
      leaveBy: trip.leaveBy,
      ticketUrl: this.ticketUrl(booking.code, trip),
    });
    return this.queue(db, booking.contactEmail, 'ticket', email, booking.id);
  }

  /** Queues "your bus now leaves at …" for a confirmed passenger. */
  async queueTripChanged(db: Db, bookingId: string): Promise<string | null> {
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: bookingForEmail,
    });
    if (!booking.contactEmail) return null;
    const { trip } = booking;
    const email = tripChangedEmail({
      code: booking.code,
      passengerName: booking.passengerName,
      origin: trip.route.originStation,
      destination: trip.route.destinationStation,
      newDeparture: departureLine(trip),
      seatLabel: booking.seatLabel,
      bayNumber: trip.bay.number,
      ticketUrl: this.ticketUrl(booking.code, trip),
    });
    return this.queue(
      db,
      booking.contactEmail,
      'trip-changed',
      email,
      booking.id,
    );
  }

  /** Queues the cancellation notice, with how the money comes back. */
  async queueTripCancelled(
    db: Db,
    bookingId: string,
    refund: 'online' | 'cash',
  ): Promise<string | null> {
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: bookingForEmail,
    });
    if (!booking.contactEmail) return null;
    const email = tripCancelledEmail({
      code: booking.code,
      passengerName: booking.passengerName,
      origin: booking.trip.route.originStation,
      destination: booking.trip.route.destinationStation,
      totalPesewas: booking.totalPesewas,
      refund,
    });
    return this.queue(
      db,
      booking.contactEmail,
      'trip-cancelled',
      email,
      booking.id,
    );
  }

  /** Queues the apology for a payment that arrived after the seat was sold. */
  async queueLateRefund(db: Db, bookingId: string): Promise<string | null> {
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: bookingForEmail,
    });
    if (!booking.contactEmail) return null;

    const email = lateRefundEmail({
      code: booking.code,
      passengerName: booking.passengerName,
      totalPesewas: booking.totalPesewas,
      origin: booking.trip.route.originStation,
      destination: booking.trip.route.destinationStation,
    });
    return this.queue(
      db,
      booking.contactEmail,
      'late-refund',
      email,
      booking.id,
    );
  }

  /**
   * Sends these queued messages now. Never throws: a failure stays QUEUED
   * (with the error) for the tick to retry, so the request that caused the
   * email still succeeds.
   */
  async send(ids: (string | null)[]): Promise<void> {
    for (const id of ids) {
      if (id) await this.sendOne(id);
    }
  }

  /** The tick's retry: queued messages older than a minute, oldest first. */
  async sendQueued(limit = 20): Promise<number> {
    const due = await this.prisma.outboundMessage.findMany({
      where: {
        status: MessageStatus.QUEUED,
        // Leave fresh ones to the request that is sending them right now
        createdAt: { lt: new Date(Date.now() - 60_000) },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    await this.send(due.map((m) => m.id));
    return due.length;
  }

  private ticketUrl(
    code: string,
    trip: Parameters<TicketsService['linkToken']>[1],
  ) {
    const t = this.tickets.linkToken(code, trip);
    return `${this.webUrl}/ticket/${code}?t=${encodeURIComponent(t)}`;
  }

  private async queue(
    db: Db,
    to: string,
    template: TemplateName,
    email: RenderedEmail,
    bookingId?: string,
  ): Promise<string> {
    const message = await db.outboundMessage.create({
      data: {
        channel: MessageChannel.EMAIL,
        to,
        template,
        subject: email.subject,
        // The HTML is what goes out; the plain-text part is rebuilt from it
        body: email.html,
        bookingId,
      },
      select: { id: true },
    });
    return message.id;
  }

  private async sendOne(id: string) {
    const message = await this.prisma.outboundMessage.findUnique({
      where: { id },
    });
    if (!message || message.status !== MessageStatus.QUEUED) return;

    try {
      await this.mailer.send({
        to: message.to,
        subject: message.subject ?? '',
        html: message.body,
        text: htmlToText(message.body),
        attachments: await this.attachmentsFor(message),
      });
      await this.prisma.outboundMessage.update({
        where: { id },
        data: {
          status: MessageStatus.SENT,
          attempts: { increment: 1 },
          lastError: null,
          ...redacted(message.template),
        },
      });
    } catch (error) {
      const attempts = message.attempts + 1;
      const reason = (error as Error).message;
      this.logger.warn(
        `Email ${id} (${message.template}) failed, attempt ${attempts}: ${reason}`,
      );
      await this.prisma.outboundMessage.update({
        where: { id },
        data: {
          status:
            attempts >= MAX_ATTEMPTS
              ? MessageStatus.FAILED
              : MessageStatus.QUEUED,
          attempts,
          lastError: reason.slice(0, 500),
          ...(attempts >= MAX_ATTEMPTS ? redacted(message.template) : {}),
        },
      });
    }
  }

  /** The ticket email's QR is drawn at send time, so it's never stored. */
  private async attachmentsFor(message: {
    template: string;
    bookingId: string | null;
  }): Promise<EmailMessage['attachments']> {
    if (message.template !== 'ticket' || !message.bookingId) return undefined;
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: message.bookingId },
      select: { code: true, tripId: true, qrNonce: true },
    });
    const png = await QRCode.toBuffer(this.tickets.qrPayload(booking), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 400,
    });
    return [{ filename: `${booking.code}.png`, content: png, cid: 'qr' }];
  }
}

// Sign-in codes and staff set-password links work like passwords, so they
// must not sit in the database: once the email has left (or been given up
// on), its stored body is wiped.
const SECRET_TEMPLATES = new Set(['otp', 'staff-invite', 'staff-reset']);

function redacted(template: string) {
  return SECRET_TEMPLATES.has(template)
    ? { body: '[removed after sending: it contained a secret]' }
    : {};
}

/** A readable plain-text version of our own simple email HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2: $1')
    .replace(/<\/(p|h1|tr|div)>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
