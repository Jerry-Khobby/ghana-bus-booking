import { Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service.js';

// Server-Sent Event streams for seat maps and payment status.
// Writes: —
// Routes: none: catalog and payments expose the /stream routes
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
