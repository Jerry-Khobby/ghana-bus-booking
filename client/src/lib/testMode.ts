import type { MomoNetwork } from '@/data/types'

/** Payments run on Paystack's test keys: this number goes through. 055 is an MTN prefix, and the API checks it. */
export const TEST_MOMO = { number: '055 123 4987', network: 'MTN' as MomoNetwork }

export const testMomoHint = `Test mode: use ${TEST_MOMO.number} on ${TEST_MOMO.network}. No real money moves.`
