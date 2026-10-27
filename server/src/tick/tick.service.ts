import { Injectable, Logger } from '@nestjs/common';
import { BookingsService } from '../bookings/bookings.service.js';
import { SeatStatus, TripStatus } from '../generated/prisma/enums.js';
import { MessagesService } from '../messages/messages.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isStatusStale, TripsService } from '../trips/trips.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The safety net behind every lazy check. A schedule calls it every 30
 * minutes, but nothing depends on its timing: each step is also done on
 * demand when someone reads the data, and running it twice does no harm.
 */
@Injectable()
export class TickService {
  private readonly logger = new Logger(TickService.name);
  // In memory: a restart may clean up twice in a day, which is harmless
  private lastCleanupDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly trips: TripsService,
    private readonly payments: PaymentsService,
    private readonly messages: MessagesService,
  ) {}

  async run(now = new Date()) {
    const holdsFreed = await this.freeExpiredHolds(now);
    const paymentsChecked = await this.payments.sweepPending(now);
    const tripsUpdated = await this.refreshTrips(now);
    const emailsSent = await this.messages.sendQueued();
    const refundsRequested = await this.payments.requestRefunds();
    const cleanedUp = await this.dailyCleanup(now);

    const summary = {
      holdsFreed,
      paymentsChecked,
      tripsUpdated,
      emailsSent,
      refundsRequested,
      cleanedUp,
    };
    this.logger.log(`Tick: ${JSON.stringify(summary)}`);
    return summary;
  }

  /** 1. Expired holds on every trip that has any. */
  private async freeExpiredHolds(now: Date) {
    const trips = await this.prisma.tripSeat.findMany({
      where: { status: SeatStatus.HELD, holdExpiresAt: { lt: now } },
      distinct: ['tripId'],
      select: { tripId: true },
    });
    let freed = 0;
    for (const { tripId } of trips) {
      freed += await this.bookings.expireStaleHolds(this.prisma, tripId, now);
    }
    return freed;
  }

  /** 3. Trips whose stored status the clock has overtaken. */
  private async refreshTrips(now: Date) {
    const candidates = await this.prisma.trip.findMany({
      where: {
        status: {
          in: [TripStatus.SCHEDULED, TripStatus.LOADING, TripStatus.FULL],
        },
        OR: [{ loadingStartsAt: { lte: now } }, { departureAt: { lte: now } }],
      },
      select: {
        id: true,
        status: true,
        mode: true,
        loadingStartsAt: true,
        departureAt: true,
      },
    });
    let updated = 0;
    for (const trip of candidates.filter((t) => isStatusStale(t, now))) {
      await this.trips.refreshStatus(trip.id, now);
      const after = await this.prisma.trip.findUnique({
        where: { id: trip.id },
        select: { status: true },
      });
      if (after?.status !== trip.status) updated++;
    }
    return updated;
  }

  /** 5. Once a day, from 03:00: delete what nothing needs any more. */
  private async dailyCleanup(now: Date) {
    const today = now.toISOString().slice(0, 10);
    if (now.getUTCHours() < 3 || this.lastCleanupDay === today) return false;
    this.lastCleanupDay = today;

    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    await this.prisma.otpCode.deleteMany({
      where: { createdAt: { lt: ago(1) } },
    });
    await this.prisma.staffToken.deleteMany({
      where: { usedAt: { not: null }, createdAt: { lt: ago(30) } },
    });
    await this.prisma.webhookEvent.deleteMany({
      where: { createdAt: { lt: ago(90) } },
    });
    await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return true;
  }
}
