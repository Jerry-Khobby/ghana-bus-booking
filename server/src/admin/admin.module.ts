import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

// Operator setup: overview, trips, buses, layouts, routes, bays, agents, cash.
// Writes: Bus, SeatLayout, Route, Bay, StaffUser, CashEntry
// Routes: /admin/*
@Module({
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
