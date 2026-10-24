import { Module } from '@nestjs/common';
import { TickController } from './tick.controller.js';
import { TickService } from './tick.service.js';

// POST /internal/tick: sweeps holds, payments, trips, unsent email, cleanup.
// Writes: various
// Routes: /internal/tick
@Module({
  controllers: [TickController],
  providers: [TickService],
  exports: [TickService],
})
export class TickModule {}
