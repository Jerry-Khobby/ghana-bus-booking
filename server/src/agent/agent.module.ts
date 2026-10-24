import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller.js';
import { AgentService } from './agent.service.js';

// Agent console: loading, walk-in sales, scanning, boarding, departure.
// Writes: Booking, CashEntry, ScanLog
// Routes: /agent/*
@Module({
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
