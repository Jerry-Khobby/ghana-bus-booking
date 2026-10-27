import type {
  CardCharge,
  ChargeResult,
  MomoCharge,
  PaymentProvider,
} from './payment-provider.js';

interface FakeCharge {
  phone?: string;
  amountPesewas: number;
  startedAt: number;
}

/**
 * Stand-in provider for automated tests and CI (PAYMENT_PROVIDER=fake), so
 * they never call Paystack. The running app uses PaystackProvider.
 * - mobile money numbers ending in 0000 succeed after a few seconds
 * - numbers ending in 1111 fail with "Not enough money in the wallet"
 * - any other number stays pending until the payment is abandoned
 * - cards always succeed after the same delay
 * Charges live in memory, so a restart forgets them (they then stay pending).
 */
export class FakeProvider implements PaymentProvider {
  readonly name = 'FAKE' as const;

  /** How long a charge takes to resolve; tests set this to 0. */
  delayMs = Number(process.env.FAKE_PAYMENT_DELAY_MS ?? 5000);

  private readonly charges = new Map<string, FakeCharge>();

  async chargeMomo(charge: MomoCharge): Promise<ChargeResult> {
    this.charges.set(charge.reference, {
      phone: charge.phone,
      amountPesewas: charge.amountPesewas,
      startedAt: Date.now(),
    });
    return { status: 'pending' };
  }

  async initCard(charge: CardCharge) {
    this.charges.set(charge.reference, {
      amountPesewas: charge.amountPesewas,
      startedAt: Date.now(),
    });
    return {
      status: 'pending' as const,
      authorizationUrl: `fake://checkout/${charge.reference}`,
    };
  }

  /** References refunded so far, for tests to inspect. */
  readonly refunds: string[] = [];

  async refund(reference: string): Promise<void> {
    this.refunds.push(reference);
  }

  async verify(reference: string): Promise<ChargeResult> {
    const charge = this.charges.get(reference);
    if (!charge || Date.now() - charge.startedAt < this.delayMs) {
      return { status: 'pending' };
    }
    if (!charge.phone || charge.phone.endsWith('0000')) {
      return {
        status: 'success',
        amountPesewas: charge.amountPesewas,
        currency: 'GHS',
      };
    }
    if (charge.phone.endsWith('1111')) {
      return { status: 'failed', failureCode: 'INSUFFICIENT_FUNDS' };
    }
    return { status: 'pending' };
  }
}
