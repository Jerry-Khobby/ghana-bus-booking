import type { MomoNetwork } from '../../generated/prisma/enums.js';

/** Injection token for the active provider (PAYMENT_PROVIDER=fake|paystack). */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type FailureCode =
  | 'PROMPT_EXPIRED'
  | 'INSUFFICIENT_FUNDS'
  | 'WRONG_PIN'
  | 'CARD_DECLINED'
  | 'PROVIDER_REFUSED'
  | 'PROVIDER_DOWN'
  | 'AMOUNT_MISMATCH'
  | 'ABANDONED';

/** What the provider says about a charge, from any path: charge, verify or webhook. */
export type ChargeResult =
  | {
      status: 'pending';
      /** The provider's instructions for the payer, e.g. how to approve. */
      displayText?: string;
      raw?: unknown;
    }
  | {
      status: 'success';
      amountPesewas: number;
      currency: string;
      raw?: unknown;
    }
  | {
      status: 'failed';
      failureCode: FailureCode;
      /** The provider's own reason, shown when we have no better message. */
      message?: string;
      raw?: unknown;
    };

export interface MomoCharge {
  reference: string;
  amountPesewas: number;
  email: string;
  /** E.164 */
  phone: string;
  network: MomoNetwork;
}

export interface CardCharge {
  reference: string;
  amountPesewas: number;
  email: string;
}

/** The provider couldn't be reached or errored: PAYMENT_PROVIDER_DOWN. */
export class ProviderUnavailableError extends Error {}

/**
 * Everything the app needs from a payment provider. PaystackProvider runs the
 * app (in Paystack test mode); FakeProvider is for automated tests, which
 * mustn't depend on Paystack being reachable.
 */
export interface PaymentProvider {
  readonly name: 'PAYSTACK' | 'FAKE';
  /** Sends the approval prompt to the payer's phone. */
  chargeMomo(charge: MomoCharge): Promise<ChargeResult>;
  /** Starts a card payment; the payer finishes it at authorizationUrl. */
  initCard(
    charge: CardCharge,
  ): Promise<ChargeResult & { authorizationUrl?: string }>;
  /** Asks the provider for the charge's current result. */
  verify(reference: string): Promise<ChargeResult>;
  /** Asks the provider to send the money back. Throws if it refuses. */
  refund(reference: string, amountPesewas: number): Promise<void>;
  /** True if a webhook really came from the provider. */
  verifyWebhook?(rawBody: Buffer, signature: string | undefined): boolean;
}
