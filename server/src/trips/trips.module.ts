import { Module } from '@nestjs/common';
import { TripsService } from './trips.service.js';

// Trip creation, lazy status refresh, seat generation from the layout.
// Writes: Trip, TripSeat
// Routes: none: used by catalog, admin and agent
@Module({
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
