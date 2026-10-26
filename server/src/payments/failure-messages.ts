import type { FailureCode } from './providers/payment-provider.js';

// What the Payment failed screen shows. Written for passengers, not developers.
export const FAILURE_MESSAGES: Record<FailureCode, string> = {
  PROMPT_EXPIRED: 'The prompt expired before it was approved',
  INSUFFICIENT_FUNDS: 'Not enough money in the wallet',
  WRONG_PIN: 'Wrong PIN entered',
  CARD_DECLINED: 'Card declined by the bank',
  PROVIDER_REFUSED: 'The payment was refused. Check the details and try again.',
  PROVIDER_DOWN: 'Mobile money is not responding. Try again or use a card.',
  AMOUNT_MISMATCH: 'We could not confirm this payment. Our team will check it.',
  ABANDONED: 'The payment was not completed in time',
};
