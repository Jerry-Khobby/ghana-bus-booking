import { createHmac, timingSafeEqual } from 'node:crypto';
import { toLocalPhone } from '../../common/phone.js';
import type { MomoNetwork } from '../../generated/prisma/enums.js';
import {
  ProviderUnavailableError,
  type CardCharge,
  type ChargeResult,
  type FailureCode,
  type MomoCharge,
  type PaymentProvider,
} from './payment-provider.js';

const API = 'https://api.paystack.co';
const TIMEOUT_MS = 15_000;

// Paystack's codes for Ghana mobile money (GET /bank?currency=GHS&type=mobile_money).
// Telecel is still "vod" from its Vodafone days.
const PROVIDER_CODES: Record<MomoNetwork, string> = {
  MTN: 'mtn',
  TELECEL: 'vod',
  AIRTELTIGO: 'atl',
};

// Charge and transaction statuses that mean "not decided yet".
// pay_offline: the approval prompt is on the payer's phone (MTN).
// send_otp: the payer must enter a code (Telecel vouchers).
const PENDING = new Set([
  'pending',
  'ongoing',
  'processing',
  'queued',
  'pay_offline',
  'send_otp',
  'open_url',
]);
const FAILED = new Set(['failed', 'reversed', 'abandoned']);

/** The fields of a Paystack charge or transaction this app reads. */
interface PaystackTransaction {
  id?: number;
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  gateway_response?: string | null;
  message?: string | null;
  display_text?: string | null;
  paid_at?: string | null;
  authorization_url?: string;
}

interface PaystackResponse {
  status: boolean;
  message: string;
  data?: PaystackTransaction | null;
}

/**
 * Paystack's Charge API for mobile money, Initialize Transaction for cards,
 * and Verify for results. Use sk_test_ keys: test mode moves no money, and only
 * 0551234987 is approved there; other numbers are declined.
 */
export class PaystackProvider implements PaymentProvider {
  readonly name = 'PAYSTACK' as const;

  constructor(
    private readonly secretKey: string,
    /** Where the card checkout sends the payer afterwards (optional). */
    private readonly callbackUrl?: string,
  ) {}

  async chargeMomo(charge: MomoCharge): Promise<ChargeResult> {
    const res = await this.request('POST', '/charge', {
      email: charge.email,
      amount: charge.amountPesewas,
      currency: 'GHS',
      reference: charge.reference,
      mobile_money: {
        phone: toLocalPhone(charge.phone),
        provider: PROVIDER_CODES[charge.network],
      },
    });
    return toResult(res);
  }

  async initCard(charge: CardCharge) {
    const res = await this.request('POST', '/transaction/initialize', {
      email: charge.email,
      amount: charge.amountPesewas,
      currency: 'GHS',
      reference: charge.reference,
      channels: ['card'],
      ...(this.callbackUrl && { callback_url: this.callbackUrl }),
    });
    const url = res.data?.authorization_url;
    if (!res.status || !url) {
      return {
        status: 'failed' as const,
        failureCode: 'PROVIDER_REFUSED' as const,
        message: res.message,
        raw: { message: res.message },
      };
    }
    return { status: 'pending' as const, authorizationUrl: url };
  }

  async verify(reference: string): Promise<ChargeResult> {
    const res = await this.request(
      'GET',
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    // Paystack doesn't know the reference yet: nothing to decide
    if (!res.status || !res.data) return { status: 'pending' };
    return toResult(res);
  }

  async refund(reference: string, amountPesewas: number): Promise<void> {
    const res = await this.request('POST', '/refund', {
      transaction: reference,
      amount: amountPesewas,
      currency: 'GHS',
      customer_note: 'Your seat was sold before your payment arrived',
    });
    if (!res.status)
      throw new Error(`Paystack refused the refund: ${res.message}`);
  }

  /** Paystack signs the raw body with HMAC-SHA512 using the secret key. */
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<PaystackResponse> {
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ProviderUnavailableError(
        `Paystack unreachable: ${(error as Error).message}`,
      );
    }
    if (res.status === 401) {
      // A setup mistake, not an outage: surface it loudly
      throw new Error('Paystack rejected PAYSTACK_SECRET_KEY');
    }
    if (res.status === 429 || res.status >= 500) {
      throw new ProviderUnavailableError(`Paystack answered ${res.status}`);
    }
    const json = (await res
      .json()
      .catch(() => null)) as PaystackResponse | null;
    if (!json) {
      throw new ProviderUnavailableError(
        'Paystack sent a response we could not read',
      );
    }
    return json;
  }
}

/** Turns a Paystack charge or verify response into a ChargeResult. */
export function toResult(res: PaystackResponse): ChargeResult {
  const data = res.data ?? {};
  const status = data.status ?? '';
  // Keep only what support needs; never card or customer details
  const raw = {
    id: data.id,
    status,
    channel: data.channel,
    gateway_response: data.gateway_response,
    message: data.message ?? res.message,
    paid_at: data.paid_at,
  };

  if (status === 'success') {
    return {
      status: 'success',
      amountPesewas: data.amount ?? 0,
      currency: data.currency ?? '',
      raw,
    };
  }
  if (PENDING.has(status)) {
    return {
      status: 'pending',
      displayText: data.display_text ?? undefined,
      raw,
    };
  }
  if (FAILED.has(status) || res.status === false) {
    const reason = data.gateway_response || data.message || res.message;
    return {
      status: 'failed',
      failureCode: status === 'abandoned' ? 'PROMPT_EXPIRED' : classify(reason),
      message: reason ?? undefined,
      raw,
    };
  }
  return { status: 'pending', raw };
}

/** Best guess at why a payment failed, from Paystack's free-text reason. */
export function classify(reason: string | null | undefined): FailureCode {
  const text = (reason ?? '').toLowerCase();
  if (/insufficient|not enough|low balance/.test(text))
    return 'INSUFFICIENT_FUNDS';
  if (/\bpin\b/.test(text)) return 'WRONG_PIN';
  if (/timed? ?out|expired|not approved in time/.test(text))
    return 'PROMPT_EXPIRED';
  if (/declined by|card declined|do not honou?r/.test(text))
    return 'CARD_DECLINED';
  return 'PROVIDER_REFUSED';
}
