import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

// Ticket view, QR signing, signed ticket links, PDF.
// Writes: — (reads Booking)
// Routes: /tickets/:code(/pdf); /me/tickets comes with passenger accounts
@Module({
  imports: [TripsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
