import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { PaymentOwnerGuard } from './payment-owner.guard.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { FakeProvider } from './providers/fake.provider.js';
import { PaystackProvider } from './providers/paystack.provider.js';
import { PAYMENT_PROVIDER } from './providers/payment-provider.js';

// Charge, verify, webhooks, and the PaymentProvider adapters (Paystack, fake).
// Writes: Payment, WebhookEvent
// Routes: /holds/:id/pay, /payments/:id(/verify), /webhooks/paystack
// (/payments/:id/stream comes with RealtimeModule in phase 8)
@Module({
  imports: [BookingsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentOwnerGuard,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () => {
        const name = process.env.PAYMENT_PROVIDER ?? 'paystack';
        if (name === 'paystack') {
          const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
          if (!secretKey) {
            throw new Error(
              'Set PAYSTACK_SECRET_KEY (an sk_test_ key) in .env',
            );
          }
          return new PaystackProvider(
            secretKey,
            process.env.PAYSTACK_CALLBACK_URL,
          );
        }
        // Automated tests only: never calls Paystack
        if (name === 'fake') return new FakeProvider();
        throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
