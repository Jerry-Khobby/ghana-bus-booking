import { Injectable, Logger, type MessageEvent } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { interval, map, Observable } from 'rxjs';
import {
  BookingStatus,
  PaymentStatus,
  SeatStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { effectiveSeatStatus } from '../trips/trip-seats.js';

/** Proxies drop quiet connections; a ping this often keeps streams open. */
export const PING_MS = 25_000;

export interface SeatEvent {
  label: string;
  status: SeatStatus | 'MINE';
}

export interface PaymentEvent {
  paymentId: string;
  status: PaymentStatus;
  failureCode: string | null;
  failureMessage: string | null;
  bookingStatus: BookingStatus;
  /** Set once paid and the seat is theirs: the screen can open the ticket. */
  bookingCode: string | null;
}

/** Signals a bay's console to redraw; the stream fetches the new state. */
export interface ConsoleSignal {
  tripId: string;
}

const channel = {
  seat: (tripId: string) => `seat:${tripId}`,
  payment: (paymentId: string) => `payment:${paymentId}`,
  console: (bayId: string) => `console:${bayId}`,
};

/** Payments in these states won't change again, so their stream ends. */
export const SETTLED: PaymentStatus[] = [
  PaymentStatus.SUCCESS,
  PaymentStatus.FAILED,
  PaymentStatus.ABANDONED,
];

/**
 * The event bus behind the SSE streams. Code that changes seats, payments or
 * a bay's bus says so after its transaction commits (seatsChanged,
 * paymentChanged, tripChanged); this re-reads the current state and sends
 * that, so every event is a true snapshot however requests race.
 *
 * It lives in this process: the free plan runs one instance. With two or more,
 * swap the EventEmitter for Postgres LISTEN/NOTIFY; the streams don't change.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly bus = new EventEmitter();

  constructor(private readonly prisma: PrismaService) {
    // One listener per open browser tab; there is no sensible cap
    this.bus.setMaxListeners(0);
  }

  // ─── Announcing changes (never throws: a lost event mustn't fail a sale) ──

  /** These seats on a trip may have changed status. */
  seatsChanged(tripId: string, labels: string[]): void {
    if (!labels.length) return;
    this.run('seats', async () => {
      const seats = await this.prisma.tripSeat.findMany({
        where: { tripId, label: { in: labels } },
        select: { label: true, status: true, holdExpiresAt: true },
      });
      const now = new Date();
      for (const seat of seats) {
        this.bus.emit(channel.seat(tripId), {
          label: seat.label,
          status: effectiveSeatStatus(seat, now),
        } satisfies SeatEvent);
      }
    });
  }

  /** A payment may have moved on. */
  paymentChanged(paymentId: string): void {
    this.run('payment', async () => {
      const event = await this.paymentSnapshot(paymentId);
      if (event) this.bus.emit(channel.payment(paymentId), event);
    });
  }

  /** Something about a trip changed: its bay's console should redraw. */
  tripChanged(tripId: string): void {
    this.run('console', async () => {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { bayId: true },
      });
      if (trip) {
        this.bus.emit(channel.console(trip.bayId), {
          tripId,
        } satisfies ConsoleSignal);
      }
    });
  }

  // ─── Listening ────────────────────────────────────────────────────────────

  seatEvents(tripId: string) {
    return this.listen<SeatEvent>(channel.seat(tripId));
  }

  paymentEvents(paymentId: string) {
    return this.listen<PaymentEvent>(channel.payment(paymentId));
  }

  consoleSignals(bayId: string) {
    return this.listen<ConsoleSignal>(channel.console(bayId));
  }

  /** A payment as the Waiting screen sees it, or null if there's none. */
  async paymentSnapshot(paymentId: string): Promise<PaymentEvent | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        failureCode: true,
        failureMessage: true,
        booking: { select: { status: true, code: true } },
      },
    });
    if (!payment) return null;
    const ticketed =
      payment.status === PaymentStatus.SUCCESS &&
      payment.booking.status === BookingStatus.CONFIRMED;
    return {
      paymentId: payment.id,
      status: payment.status,
      failureCode: payment.failureCode,
      failureMessage: payment.failureMessage,
      bookingStatus: payment.booking.status,
      bookingCode: ticketed ? payment.booking.code : null,
    };
  }

  private listen<T>(name: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const handler = (event: T) => subscriber.next(event);
      this.bus.on(name, handler);
      return () => this.bus.off(name, handler);
    });
  }

  private run(what: string, work: () => Promise<void>) {
    work().catch((error: unknown) =>
      this.logger.warn(
        `Could not publish ${what} event: ${(error as Error).message}`,
      ),
    );
  }
}

/** The keep-alive every stream sends alongside its events. */
export function pings(): Observable<MessageEvent> {
  return interval(PING_MS).pipe(map(() => ({ type: 'ping', data: '' })));
}
