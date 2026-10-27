import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { StaffAuthModule } from '../staff-auth/staff-auth.module.js';
import { TripsModule } from '../trips/trips.module.js';
import { AdminStaffController } from './admin-staff.controller.js';
import { AdminStaffService } from './admin-staff.service.js';
import { AdminTripsController } from './admin-trips.controller.js';
import { AdminTripsService } from './admin-trips.service.js';
import { FleetController } from './fleet.controller.js';
import { FleetService } from './fleet.service.js';
import { NetworkController } from './network.controller.js';
import { NetworkService } from './network.service.js';

// Operator setup: overview, trips, buses, layouts, routes, bays, agents, cash.
// Every change writes an AuditLog row; every lookup is scoped to the admin's
// operator.
// Writes: Bus, SeatLayout, Route, Bay, Trip, TripSeat, StaffUser, CashEntry
// Routes: /admin/*
@Module({
  imports: [
    AuditModule,
    AuthModule,
    StaffAuthModule,
    TripsModule,
    MessagesModule,
    PaymentsModule,
  ],
  controllers: [
    FleetController,
    NetworkController,
    AdminTripsController,
    AdminStaffController,
  ],
  providers: [
    FleetService,
    NetworkService,
    AdminTripsService,
    AdminStaffService,
  ],
})
export class AdminModule {}
