import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service.js';

// The event bus behind the Server-Sent Event streams. Global, because seats,
// payments and trips change all over the app and each place announces it.
// Writes: —
// Routes: none: catalog, payments and the agent console expose /stream routes
@Global()
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
