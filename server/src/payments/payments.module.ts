import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

// Charge, verify, webhooks, and the PaymentProvider adapters (Paystack, fake).
// Writes: Payment, WebhookEvent
// Routes: /holds/:id/pay, /payments/:id(/stream|/verify), /webhooks/paystack
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
