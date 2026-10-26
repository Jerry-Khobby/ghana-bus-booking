import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service.js';

// Global: anything that takes money (online pay, walk-in sales) can use it.
@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
