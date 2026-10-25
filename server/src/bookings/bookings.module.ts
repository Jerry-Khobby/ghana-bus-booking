import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { TripsModule } from '../trips/trips.module.js';

// Seat holds, lazy hold expiry, the booking lifecycle (BookingsService.transition()).
// Writes: Booking, TripSeat
// Routes: /holds, /holds/:id
@Module({
  imports: [TripsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
