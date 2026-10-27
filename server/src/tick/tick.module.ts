import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { TripsModule } from '../trips/trips.module.js';
import { TickController } from './tick.controller.js';
import { TickService } from './tick.service.js';

// POST /internal/tick: sweeps holds, payments, trips, unsent email, cleanup.
// Writes: various
// Routes: /internal/tick
@Module({
  imports: [BookingsModule, TripsModule, PaymentsModule, MessagesModule],
  controllers: [TickController],
  providers: [TickService],
})
export class TickModule {}
