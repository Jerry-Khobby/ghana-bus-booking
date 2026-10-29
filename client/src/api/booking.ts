import type { ApiStation, ApiBusType, ApiTripStatus } from './catalog'
import { api, newIdempotencyKey } from './client'

/* Holding seats, paying for them, and the tickets that come out. */

// ─── Holds ───────────────────────────────────────────────────────────────────

export interface ApiHold {
  holdId: string
  /** Only in the reply to POST /holds: the guest's proof of ownership. */
  holdToken?: string
  tripId: string
  seatLabel: string
  seatLabels: string[]
  expiresAt: string
  /** Per seat. */
  farePesewas: number
  feePesewas: number
  /** Every seat in the hold. */
  totalPesewas: number
  currency: 'GHS'
  /** GET /holds/:id only. */
  status?: 'HELD' | 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | string
  secondsLeft?: number
  /** GET /holds/:id only: the latest payment attempt, if any. */
  payment?: { id: string; status: string } | null
}

/** Holds these seats together. `holdToken`: the caller's current hold on the trip, which this replaces. */
export function createHold(tripId: string, seatLabels: string[], holdToken?: string) {
  return api<ApiHold & { holdToken: string }>('/holds', {
    method: 'POST',
    body: { tripId, seatLabels },
    holdToken,
  })
}

export function getHold(holdId: string, holdToken: string) {
  return api<ApiHold>(`/holds/${holdId}`, { holdToken })
}

export function releaseHold(holdId: string, holdToken: string) {
  return api<void>(`/holds/${holdId}`, { method: 'DELETE', holdToken })
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type ApiMomoNetwork = 'MTN' | 'TELECEL' | 'AIRTELTIGO'

export interface PayRequest {
  method: 'MOMO' | 'CARD'
  phone?: string
  network?: ApiMomoNetwork
  contactEmail: string
  passengerName?: string
}

export type ApiPaymentStatus = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED'

export interface ApiPaidTicket {
  code: string
  seatLabel: string
  /** Opens /tickets/:code?t=… without an account. */
  ticketToken: string
}

export interface ApiPayment {
  paymentId: string
  status: ApiPaymentStatus
  method: 'MOMO' | 'CARD' | 'CASH'
  amountPesewas: number
  currency: 'GHS'
  displayText: string
  providerMessage: string | null
  /** CARD: Paystack's checkout page. */
  authorizationUrl: string | null
  failureCode: string | null
  failureMessage: string | null
  bookingStatus: string
  bookingCode: string | null
  ticketToken: string | null
  tickets: ApiPaidTicket[]
  secondsLeftOnHold: number
}

export const SETTLED: ApiPaymentStatus[] = ['SUCCESS', 'FAILED', 'ABANDONED']

/**
 * Starts paying. `idempotencyKey` stays the same for every retry of one
 * attempt, so a request resent after a lost reply never charges twice.
 */
export function payHold(holdId: string, holdToken: string, body: PayRequest, idempotencyKey = newIdempotencyKey()) {
  return api<ApiPayment>(`/holds/${holdId}/pay`, { method: 'POST', body, holdToken, idempotencyKey })
}

export function getPayment(paymentId: string, holdToken?: string | null) {
  return api<ApiPayment>(`/payments/${paymentId}`, { holdToken })
}

/** "I have approved it": asks Paystack now instead of waiting. */
export function verifyPayment(paymentId: string, holdToken?: string | null) {
  return api<ApiPayment>(`/payments/${paymentId}/verify`, { method: 'POST', holdToken })
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export interface ApiTicket {
  code: string
  status: 'CONFIRMED' | 'BOARDED' | 'NO_SHOW'
  seatLabel: string
  passengerName: string | null
  totalPesewas: number
  currency: 'GHS'
  operator: { name: string; phone: string | null }
  route: {
    origin: Pick<ApiStation, 'name' | 'city'>
    destination: Pick<ApiStation, 'name' | 'city'>
    durationMinutes: number | null
  }
  bus: { plate: string; type: ApiBusType }
  bay: { number: number }
  tripStatus: ApiTripStatus
  mode: 'FIXED_TIME' | 'WHEN_FULL'
  departureAt: string | null
  loadingStartsAt: string | null
  leaveBy: string | null
  boardedAt: string | null
  /** What the QR code encodes; the agent's scanner checks its signature. */
  qrPayload: string
}

/** A ticket by its link token, the hold token it was paid with, or the signed-in owner. */
export function getTicket(code: string, access: { t?: string | null; holdToken?: string | null }) {
  return api<ApiTicket>(`/tickets/${encodeURIComponent(code)}`, {
    query: { t: access.t ?? undefined },
    holdToken: access.holdToken,
  })
}

/** The PDF, for "Save as PDF"; same access rules as the ticket. */
export function ticketPdfPath(code: string) {
  return `/tickets/${encodeURIComponent(code)}/pdf`
}
