import type { MomoNetwork } from '@/data/types'

/** Payments run on Paystack's test keys: only this number, on Telecel, goes through. */
export const TEST_MOMO = { number: '055 123 4987', network: 'Telecel' as MomoNetwork }

export const testMomoHint = `Test mode: use ${TEST_MOMO.number} on ${TEST_MOMO.network}. No real money moves.`
