import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { BookingsService } from '../bookings/bookings.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import {
  maskPhone,
  NETWORK_NAMES,
  networkOf,
  normalizeGhanaPhone,
} from '../common/phone.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BookingStatus,
  MomoNetwork,
  PaymentMethod,
  PaymentStatus,
  SeatStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { availableSeatWhere } from '../trips/trip-seats.js';
import { PayHoldDto } from './dto/pay-hold.dto.js';
import { FAILURE_MESSAGES } from './failure-messages.js';
import {
  PAYMENT_PROVIDER,
  ProviderUnavailableError,
  type ChargeResult,
  type PaymentProvider,
} from './providers/payment-provider.js';

type Tx = Prisma.TransactionClient;

/** The prompt stays out at least this long, so a slow approval isn't cut off. */
const MIN_HOLD_WHILE_PAYING_MS = 3 * 60_000;
/** A poll asks the provider once a payment has been pending this long… */
const VERIFY_ON_POLL_AFTER_MS = 30_000;
/** …and at most this often per payment. */
const VERIFY_ON_POLL_EVERY_MS = 10_000;
/** "I have approved it" can be pressed this often. */
const VERIFY_BUTTON_EVERY_MS = 5_000;
/** The tick checks payments that have been pending this long. */
const SWEEP_AFTER_MS = 2 * 60_000;
/** Still pending this long after it started: the payer gave up. */
const ABANDON_AFTER_MS = 10 * 60_000;

/** Sent to Paystack for walk-ins who gave no email. */
const WALK_IN_PAYER_EMAIL =
  process.env.WALK_IN_PAYER_EMAIL ?? 'walk-in@seatline.example';

const OPEN_PAYMENTS = [PaymentStatus.INITIATED, PaymentStatus.PENDING];
const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

const bookingForResult = {
  id: true,
  status: true,
  tripId: true,
  tripSeatId: true,
  holdExpiresAt: true,
} satisfies Prisma.BookingSelect;
type BookingForResult = Prisma.BookingGetPayload<{
  select: typeof bookingForResult;
}>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  // When each payment was last checked with the provider. In memory is enough
  // for one instance; it only rate-limits calls, so a restart losing it is fine.
  private readonly lastPollVerify = new Map<string, number>();
  private readonly lastButtonVerify = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly idempotency: IdempotencyService,
    private readonly tickets: TicketsService,
    private readonly messages: MessagesService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * POST /holds/:id/pay: starts paying for a held seat. A second tap while
   * the prompt is still out returns the same payment instead of charging again.
   */
  async pay(bookingId: string, dto: PayHoldDto, idempotencyKey?: string) {
    const scope = `pay:${bookingId}`;
    const requestHash = this.idempotency.hashRequest(dto);
    if (idempotencyKey) {
      const replayed = await this.idempotency.replay(
        idempotencyKey,
        scope,
        requestHash,
      );
      if (replayed) return replayed;
    }

    const momo = dto.method === 'MOMO' ? this.checkMomoNumber(dto) : null;
    const now = new Date();

    const started = await this.prisma.$transaction(async (tx) => {
      const { tripId } = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { tripId: true },
      });
      await this.bookings.expireStaleHolds(tx, tripId, now);

      // The conditional update locks the booking, so two taps queue here and
      // the second finds the first one's payment.
      const { count } = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.HELD,
          holdExpiresAt: { gt: now },
        },
        data: {
          status: BookingStatus.PENDING_PAYMENT,
          contactEmail: dto.contactEmail,
          contactPhone: momo?.phone,
          passengerName: dto.passengerName,
        },
      });
      if (!count) {
        const open = await tx.payment.findFirst({
          where: { bookingId, status: { in: OPEN_PAYMENTS } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (open) return { paymentId: open.id, isNew: false };
        throw await this.notPayable(tx, bookingId);
      }

      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { totalPesewas: true, holdExpiresAt: true },
      });
      const minExpiry = new Date(now.getTime() + MIN_HOLD_WHILE_PAYING_MS);
      if (booking.holdExpiresAt! < minExpiry) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { holdExpiresAt: minExpiry },
        });
        await tx.tripSeat.updateMany({
          where: { bookingId },
          data: { holdExpiresAt: minExpiry },
        });
      }

      const payment = await tx.payment.create({
        data: {
          bookingId,
          method: dto.method,
          network: momo?.network,
          payerPhone: momo?.phone,
          amountPesewas: booking.totalPesewas,
          provider: this.provider.name,
          providerRef: `pay_${randomBytes(12).toString('hex')}`,
          status: PaymentStatus.INITIATED,
        },
        select: { id: true, providerRef: true, amountPesewas: true },
      });
      return { paymentId: payment.id, isNew: true, payment };
    }, TX_OPTIONS);

    if (started.isNew && started.payment) {
      await this.startCharge(started.payment, dto, momo);
    }

    const response = await this.describe(started.paymentId);
    if (idempotencyKey) {
      await this.idempotency.remember(
        idempotencyKey,
        scope,
        requestHash,
        HttpStatus.CREATED,
        response,
      );
    }
    return response;
  }

  /**
   * A walk-in sold by mobile money at the bay. The booking already holds the
   * seat; this charges the passenger's number exactly as an online payment
   * would, and the console polls GET /agent/payments/:id for the result.
   */
  async payWalkIn(
    bookingId: string,
    momo: { phone: string; network: MomoNetwork },
    agentId: string,
    email: string | undefined,
  ) {
    const now = new Date();
    const payment = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.HELD,
          holdExpiresAt: { gt: now },
        },
        data: { status: BookingStatus.PENDING_PAYMENT },
      });
      if (!count) throw await this.notPayable(tx, bookingId);
      const { totalPesewas } = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { totalPesewas: true },
      });
      return tx.payment.create({
        data: {
          bookingId,
          method: PaymentMethod.MOMO,
          network: momo.network,
          payerPhone: momo.phone,
          amountPesewas: totalPesewas,
          provider: this.provider.name,
          providerRef: `pay_${randomBytes(12).toString('hex')}`,
          status: PaymentStatus.INITIATED,
          initiatedById: agentId,
        },
        select: { id: true, providerRef: true, amountPesewas: true },
      });
    }, TX_OPTIONS);

    // Paystack needs an email; walk-ins often have none
    await this.startCharge(
      payment,
      {
        method: 'MOMO',
        contactEmail: email ?? WALK_IN_PAYER_EMAIL,
      } as PayHoldDto,
      momo,
    );
    return this.describe(payment.id);
  }

  /** Normalises a MoMo number and checks it belongs to the network. */
  checkMomo(phone: string, network: MomoNetwork) {
    return this.checkMomoNumber({ phone, network } as PayHoldDto);
  }

  /**
   * GET /payments/:id. While a payment is pending this call also moves it
   * along: after 30 seconds it asks the provider (at most every 10 seconds),
   * and after 10 minutes it gives up. The Waiting screen's polling replaces a
   * background job.
   */
  async getPayment(id: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
      select: { status: true, providerRef: true, createdAt: true },
    });

    if ((OPEN_PAYMENTS as PaymentStatus[]).includes(payment.status)) {
      const now = Date.now();
      const age = now - payment.createdAt.getTime();
      const lastChecked = this.lastPollVerify.get(id) ?? 0;

      if (age >= VERIFY_ON_POLL_AFTER_MS || age >= ABANDON_AFTER_MS) {
        if (now - lastChecked >= VERIFY_ON_POLL_EVERY_MS) {
          this.lastPollVerify.set(id, now);
          await this.verifyWithProvider(payment.providerRef);
        }
        if (age >= ABANDON_AFTER_MS) {
          await this.applyResult(payment.providerRef, {
            status: 'failed',
            failureCode: 'ABANDONED',
          });
        }
      }
    }
    return this.describe(id);
  }

  /** POST /payments/:id/verify: "I have approved it". Asks the provider now. */
  async verify(id: string) {
    const now = Date.now();
    const last = this.lastButtonVerify.get(id) ?? 0;
    if (now - last < VERIFY_BUTTON_EVERY_MS) {
      const retryAfterSeconds = Math.ceil(
        (VERIFY_BUTTON_EVERY_MS - (now - last)) / 1000,
      );
      throw new AppException(
        'RATE_LIMITED',
        'Checking too often. Try again in a few seconds.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSeconds },
      );
    }
    this.lastButtonVerify.set(id, now);

    const { providerRef } = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
      select: { providerRef: true },
    });
    await this.verifyWithProvider(providerRef);
    return this.describe(id);
  }

  /**
   * The tick's sweep: payments pending over 2 minutes are checked with the
   * provider, and those still pending after 10 minutes are abandoned.
   * Returns how many were checked.
   */
  async sweepPending(now = new Date()): Promise<number> {
    const pending = await this.prisma.payment.findMany({
      where: {
        status: { in: OPEN_PAYMENTS },
        createdAt: { lt: new Date(now.getTime() - SWEEP_AFTER_MS) },
      },
      select: { providerRef: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const payment of pending) {
      await this.verifyWithProvider(payment.providerRef);
      if (now.getTime() - payment.createdAt.getTime() >= ABANDON_AFTER_MS) {
        await this.applyResult(payment.providerRef, {
          status: 'failed',
          failureCode: 'ABANDONED',
        });
      }
    }
    return pending.length;
  }

  /**
   * The tick's refunds: for each REFUND_PENDING booking whose payment hasn't
   * been sent back yet, asks the provider to refund it and records when, so
   * it is never asked twice. Failures are retried on the next tick.
   * TODO(phase 8): mark the booking REFUNDED from Paystack's refund webhook.
   */
  async requestRefunds(): Promise<number> {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCESS,
        booking: { status: BookingStatus.REFUND_PENDING },
      },
      select: {
        id: true,
        providerRef: true,
        amountPesewas: true,
        providerPayload: true,
      },
    });
    let requested = 0;
    for (const payment of payments) {
      const payload = (payment.providerPayload ?? {}) as Record<
        string,
        unknown
      >;
      if (payload.refundRequestedAt) continue;
      try {
        await this.provider.refund(payment.providerRef, payment.amountPesewas);
      } catch (error) {
        this.logger.warn(
          `Refund for ${payment.providerRef} failed: ${(error as Error).message}`,
        );
        continue;
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPayload: {
            ...payload,
            refundRequestedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      requested++;
    }
    return requested;
  }

  /**
   * POST /webhooks/paystack. Trusted only after the signature check. Each event
   * is recorded once; a repeat is acknowledged and ignored. Rather than trust
   * the event's contents, it asks the provider for the payment's result, then
   * applies it like every other path. Throwing makes Paystack retry later.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature?: string) {
    if (
      !rawBody ||
      !this.provider.verifyWebhook ||
      !this.provider.verifyWebhook(rawBody, signature)
    ) {
      this.logger.warn('Rejected a webhook with a bad or missing signature');
      throw new AppException(
        'UNAUTHENTICATED',
        'Invalid webhook signature',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      data?: { id?: number | string; reference?: string };
    };
    const reference = event.data?.reference;
    const eventId = `${event.event}:${event.data?.id ?? reference}`;

    const { count } = await this.prisma.webhookEvent.createMany({
      data: {
        provider: this.provider.name,
        eventId,
        type: event.event ?? 'unknown',
        payload: event as Prisma.InputJsonValue,
      },
      skipDuplicates: true,
    });
    if (!count) return; // seen before

    const payment = reference
      ? await this.prisma.payment.findUnique({
          where: { providerRef: reference },
          select: { id: true },
        })
      : null;
    try {
      if (payment) await this.verifyWithProvider(reference!);
      await this.prisma.webhookEvent.updateMany({
        where: { provider: this.provider.name, eventId },
        data: { processedAt: new Date() },
      });
    } catch (error) {
      // Forget the event so Paystack's retry is processed, not skipped
      await this.prisma.webhookEvent.deleteMany({
        where: { provider: this.provider.name, eventId },
      });
      throw error;
    }
  }

  /**
   * The one place a payment result is applied, whichever way it arrived:
   * webhook, verify button, or the check on poll. Runs in one transaction with
   * the payment row locked, so two paths reporting the same result can't both
   * apply it.
   */
  async applyResult(providerRef: string, result: ChargeResult) {
    const now = new Date();
    // Emails queued in the transaction, sent once it has committed
    const outbox: (string | null)[] = [];
    await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Payment" WHERE "providerRef" = ${providerRef} FOR UPDATE`;
      if (!locked) {
        throw new Error(`No payment with reference ${providerRef}`);
      }
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: locked.id },
        select: {
          id: true,
          status: true,
          amountPesewas: true,
          booking: { select: bookingForResult },
        },
      });

      // Already settled one way or the other: nothing to do
      if (
        payment.status === PaymentStatus.SUCCESS ||
        payment.status === PaymentStatus.FAILED
      ) {
        return;
      }
      if (result.status === 'pending') return;

      const raw = (result.raw ?? undefined) as Prisma.InputJsonValue;

      if (result.status === 'success') {
        if (
          result.amountPesewas !== payment.amountPesewas ||
          result.currency !== 'GHS'
        ) {
          // Flag for review rather than confirm or fail it
          this.logger.error(
            `Payment ${payment.id}: provider reported ${result.amountPesewas} ${result.currency}, expected ${payment.amountPesewas} GHS`,
          );
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              failureCode: 'AMOUNT_MISMATCH',
              failureMessage: FAILURE_MESSAGES.AMOUNT_MISMATCH,
              providerPayload: raw,
            },
          });
          return;
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            paidAt: now,
            failureCode: null,
            failureMessage: null,
            providerPayload: raw,
          },
        });
        outbox.push(await this.confirmBooking(tx, payment.booking, now));
        return;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status:
            result.failureCode === 'ABANDONED'
              ? PaymentStatus.ABANDONED
              : PaymentStatus.FAILED,
          failureCode: result.failureCode,
          // Paystack's own reason beats our generic "refused" line
          failureMessage:
            result.failureCode === 'PROVIDER_REFUSED' && result.message
              ? result.message
              : FAILURE_MESSAGES[result.failureCode],
          providerPayload: raw,
        },
      });
      await this.reopenHold(tx, payment.booking, now);
    }, TX_OPTIONS);
    await this.messages.send(outbox);
    // TODO(phase 8): publish payment and seat events
  }

  /**
   * Paid: sell the seat. Handles the late payment that arrives after expiry.
   * Returns the id of the email it queued (ticket, or the refund apology).
   */
  private async confirmBooking(
    tx: Tx,
    booking: BookingForResult,
    now: Date,
  ): Promise<string | null> {
    // Normal case: the seat is still this booking's
    let { count } = await tx.tripSeat.updateMany({
      where: { id: booking.tripSeatId, bookingId: booking.id },
      data: { status: SeatStatus.SOLD, holdExpiresAt: null },
    });

    if (!count) {
      // Late payment: the hold ran out. Take the seat back if it's free.
      ({ count } = await tx.tripSeat.updateMany({
        where: { id: booking.tripSeatId, ...availableSeatWhere(now) },
        data: { status: SeatStatus.SOLD, holdExpiresAt: null },
      }));
      if (count) {
        await tx.tripSeat.update({
          where: { id: booking.tripSeatId },
          data: { bookingId: booking.id },
        });
        // Someone else's hold on it had run out too
        await tx.booking.updateMany({
          where: {
            tripSeatId: booking.tripSeatId,
            id: { not: booking.id },
            status: {
              in: [BookingStatus.HELD, BookingStatus.PENDING_PAYMENT],
            },
          },
          data: { status: BookingStatus.EXPIRED },
        });
      }
    }

    if (!count) {
      // Paid, but someone else bought the seat meanwhile
      this.logger.warn(
        `Booking ${booking.id} was paid after its seat was sold; refund due`,
      );
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.REFUND_PENDING },
      });
      // TODO(phase 8): ask Paystack for the refund (POST /refund)
      return this.messages.queueLateRefund(tx, booking.id);
    }

    await this.bookings.recordSale(tx, booking, now);
    return this.messages.queueTicket(tx, booking.id);
  }

  /** Not paid: back to HELD if time remains, so the passenger can retry. */
  private async reopenHold(tx: Tx, booking: BookingForResult, now: Date) {
    if (booking.status !== BookingStatus.PENDING_PAYMENT) return;

    if (booking.holdExpiresAt && booking.holdExpiresAt > now) {
      await tx.booking.updateMany({
        where: { id: booking.id, status: BookingStatus.PENDING_PAYMENT },
        data: { status: BookingStatus.HELD },
      });
      return;
    }
    await tx.booking.updateMany({
      where: { id: booking.id, status: BookingStatus.PENDING_PAYMENT },
      data: { status: BookingStatus.EXPIRED },
    });
    await tx.tripSeat.updateMany({
      where: { bookingId: booking.id },
      data: {
        status: SeatStatus.AVAILABLE,
        holdExpiresAt: null,
        bookingId: null,
      },
    });
  }

  private async startCharge(
    payment: { id: string; providerRef: string; amountPesewas: number },
    dto: PayHoldDto,
    momo: { phone: string; network: NonNullable<PayHoldDto['network']> } | null,
  ) {
    const reference = payment.providerRef;
    let result: ChargeResult & { authorizationUrl?: string };
    try {
      result = momo
        ? await this.provider.chargeMomo({
            reference,
            amountPesewas: payment.amountPesewas,
            email: dto.contactEmail,
            ...momo,
          })
        : await this.provider.initCard({
            reference,
            amountPesewas: payment.amountPesewas,
            email: dto.contactEmail,
          });
    } catch (error) {
      if (!(error instanceof ProviderUnavailableError)) throw error;
      this.logger.warn(`Provider down for ${reference}: ${error.message}`);
      await this.applyResult(reference, {
        status: 'failed',
        failureCode: 'PROVIDER_DOWN',
      });
      throw new AppException(
        'PAYMENT_PROVIDER_DOWN',
        FAILURE_MESSAGES.PROVIDER_DOWN,
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (result.status === 'pending') {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.INITIATED },
        data: {
          status: PaymentStatus.PENDING,
          providerPayload: {
            authorizationUrl: result.authorizationUrl,
            displayText: result.displayText,
          },
        },
      });
    } else {
      await this.applyResult(reference, result);
    }
  }

  private async verifyWithProvider(providerRef: string) {
    let result: ChargeResult;
    try {
      result = await this.provider.verify(providerRef);
    } catch (error) {
      if (!(error instanceof ProviderUnavailableError)) throw error;
      // Leave it pending; the next poll tries again
      this.logger.warn(`Could not verify ${providerRef}: ${error.message}`);
      return;
    }
    await this.applyResult(providerRef, result);
  }

  /** Normalises the number and checks it belongs to the chosen network. */
  private checkMomoNumber(dto: PayHoldDto) {
    const phone = normalizeGhanaPhone(dto.phone!);
    if (!phone) {
      throw new AppException(
        'INVALID_PHONE',
        'Enter a Ghana number like 024 000 0000',
        HttpStatus.BAD_REQUEST,
      );
    }
    const network = dto.network!;
    const actual = networkOf(phone);
    if (actual !== network) {
      throw new AppException(
        'NETWORK_MISMATCH',
        `That number isn't on ${NETWORK_NAMES[network]}`,
        HttpStatus.BAD_REQUEST,
        { network: actual },
      );
    }
    return { phone, network };
  }

  /** Why a booking can't be paid for. */
  private async notPayable(tx: Tx, bookingId: string) {
    const { status } = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { status: true },
    });
    if (status === BookingStatus.HELD || status === BookingStatus.EXPIRED) {
      return new AppException(
        'HOLD_EXPIRED',
        'Your hold ran out and the seat was released',
        HttpStatus.CONFLICT,
      );
    }
    return new AppException(
      'INVALID_STATE',
      `A ${status.toLowerCase().replace('_', ' ')} booking can't be paid for`,
      HttpStatus.CONFLICT,
      { status },
    );
  }

  /** What the Waiting and Payment failed screens show. */
  private async describe(id: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        status: true,
        method: true,
        network: true,
        payerPhone: true,
        amountPesewas: true,
        failureCode: true,
        failureMessage: true,
        providerPayload: true,
        booking: {
          select: {
            code: true,
            status: true,
            holdExpiresAt: true,
            trip: {
              select: {
                departureAt: true,
                leaveBy: true,
                loadingStartsAt: true,
              },
            },
          },
        },
      },
    });
    const { booking } = payment;
    // Paid and the seat is theirs: the screen can open the ticket
    const ticketed =
      payment.status === PaymentStatus.SUCCESS &&
      booking.status === BookingStatus.CONFIRMED;

    const displayText =
      payment.method === PaymentMethod.MOMO &&
      payment.payerPhone &&
      payment.network
        ? `We sent a prompt to ${maskPhone(payment.payerPhone)} (${NETWORK_NAMES[payment.network]})`
        : 'Finish paying on the card page';
    const payload = payment.providerPayload as {
      authorizationUrl?: string;
      displayText?: string;
    } | null;
    const holdOpen =
      booking.status === BookingStatus.HELD ||
      booking.status === BookingStatus.PENDING_PAYMENT;
    const secondsLeftOnHold =
      holdOpen && booking.holdExpiresAt
        ? Math.max(
            0,
            Math.ceil((booking.holdExpiresAt.getTime() - Date.now()) / 1000),
          )
        : 0;

    return {
      paymentId: payment.id,
      status: payment.status,
      method: payment.method,
      amountPesewas: payment.amountPesewas,
      currency: 'GHS' as const,
      displayText,
      // The provider's own instructions, e.g. how to approve on Telecel
      providerMessage: payload?.displayText ?? null,
      authorizationUrl: payload?.authorizationUrl ?? null,
      failureCode: payment.failureCode,
      failureMessage: payment.failureMessage,
      bookingStatus: booking.status,
      // Opens the ticket once paid
      bookingCode:
        payment.status === PaymentStatus.SUCCESS ? booking.code : null,
      // Opens /tickets/:code?t=… without an account
      ticketToken: ticketed
        ? this.tickets.linkToken(booking.code, booking.trip)
        : null,
      secondsLeftOnHold,
    };
  }
}
