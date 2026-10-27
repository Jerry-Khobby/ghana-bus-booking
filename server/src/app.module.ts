import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { AdminModule } from './admin/admin.module.js';
import { AgentModule } from './agent/agent.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { IdempotencyModule } from './common/idempotency/idempotency.module.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { HealthModule } from './health/health.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { StaffAuthModule } from './staff-auth/staff-auth.module.js';
import { TickModule } from './tick/tick.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { TripsModule } from './trips/trips.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

const { OBSERVE_APP_KEY, OBSERVE_APP_SECRET } = process.env;

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    // Only enabled when keys are set: with placeholder keys the app hangs at boot.
    ...(OBSERVE_APP_KEY && OBSERVE_APP_SECRET
      ? [
          ObserveModule.forRoot({
            appKey: OBSERVE_APP_KEY,
            appSecret: OBSERVE_APP_SECRET,
            serviceId: 'server',
          }),
        ]
      : []),

    // Infrastructure
    PrismaModule,
    IdempotencyModule,
    HealthModule,

    // Passengers and the public catalog
    AuthModule,
    CatalogModule,
    BookingsModule,
    PaymentsModule,
    TicketsModule,

    // Staff
    StaffAuthModule,
    AgentModule,
    AdminModule,
    PlatformModule,
    ReportsModule,

    // Shared domain services and background work
    TripsModule,
    MessagesModule,
    RealtimeModule,
    AuditModule,
    TickModule,
  ],
  providers: [
    // Every error leaves the API as { error: { code, message, details } }
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // DTOs are validated on every route; failures become VALIDATION_FAILED
    { provide: APP_PIPE, useFactory: createValidationPipe },
    // Every route needs a valid access token unless marked @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
