import type { MomoNetwork } from '../../generated/prisma/enums.js';

/** Injection token for the active provider (PAYMENT_PROVIDER=fake|paystack). */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type FailureCode =
  | 'PROMPT_EXPIRED'
  | 'INSUFFICIENT_FUNDS'
  | 'WRONG_PIN'
  | 'CARD_DECLINED'
  | 'PROVIDER_REFUSED'
  | 'AMOUNT_MISMATCH'
  | 'ABANDONED';

/** What the provider says about a charge, from any path: charge, verify or webhook. */
export type ChargeResult =
  | { status: 'pending'; raw?: unknown }
  | {
      status: 'success';
      amountPesewas: number;
      currency: string;
      raw?: unknown;
    }
  | { status: 'failed'; failureCode: FailureCode; raw?: unknown };

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
 * Everything the app needs from a payment provider. PaystackProvider comes in
 * phase 8; FakeProvider stands in until then and in tests.
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
}
