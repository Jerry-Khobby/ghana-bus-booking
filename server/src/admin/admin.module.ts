import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
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
  imports: [AuditModule],
  controllers: [FleetController, NetworkController],
  providers: [FleetService, NetworkService],
})
export class AdminModule {}
