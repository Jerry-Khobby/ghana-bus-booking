import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

// Ticket view, QR signing, PDF, My tickets.
// Writes: — (reads Booking)
// Routes: /tickets/:code(/pdf), /me/tickets
@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
