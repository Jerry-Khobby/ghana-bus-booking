import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { TripsModule } from '../trips/trips.module.js';
import { AgentScopeService } from './agent-scope.service.js';
import { AgentController } from './agent.controller.js';
import { AgentService } from './agent.service.js';
import { ScanningService } from './scanning.service.js';
import { WalkInsService } from './walk-ins.service.js';

// Agent console: loading, walk-in sales, scanning, boarding, departure.
// Writes: Booking, Payment, CashEntry, ScanLog, AuditLog
// Routes: /agent/*
@Module({
  imports: [
    TripsModule,
    BookingsModule,
    PaymentsModule,
    TicketsModule,
    MessagesModule,
    AuditModule,
  ],
  controllers: [AgentController],
  providers: [AgentScopeService, AgentService, WalkInsService, ScanningService],
})
export class AgentModule {}
