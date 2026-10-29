import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiPayment, ApiMomoNetwork } from './booking'
import type { ApiBusType, ApiTripStatus } from './catalog'
import { api, getAccessToken, onAccessTokenChange } from './client'
import { useEventStream } from './stream'

/* The station agent's console: one bay at a time, kept live. */

// ─── What the API sends ──────────────────────────────────────────────────────

export interface ApiConsoleSeat {
  label: string
  r: number
  c: number
  status: 'AVAILABLE' | 'HELD' | 'SOLD' | 'BLOCKED'
  boarded: boolean
}

export interface ApiQueuedTrip {
  id: string
  status: ApiTripStatus
  mode: 'FIXED_TIME' | 'WHEN_FULL'
  departureAt: string | null
  loadingStartsAt: string | null
  plate: string
  destination: { name: string; city: string }
  counts: { total: number; sold: number; online: number; walkIn: number }
}

export interface ApiConsole {
  bay: { id: string; number: number; station: { id: string; name: string; city: string } }
  bays: { id: string; number: number }[]
  trip: {
    id: string
    status: ApiTripStatus
    mode: 'FIXED_TIME' | 'WHEN_FULL'
    route: { origin: { name: string; city: string }; destination: { name: string; city: string } }
    bus: { plate: string; type: ApiBusType }
    departureAt: string | null
    loadingStartsAt: string | null
    leaveBy: string | null
    farePesewas: number
    currency: 'GHS'
    /** e.g. "Loading — leaves at 14:30" */
    banner: string
    /** Its time has come: the agent should send it off. */
    departDue: boolean
  } | null
  counts: { total: number; sold: number; online: number; walkIn: number; boarded: number; held: number; free: number } | null
  seats: ApiConsoleSeat[]
  nextTrip: ApiQueuedTrip | null
  queue: ApiQueuedTrip[]
}

export interface ApiScan {
  result: 'VALID' | 'REJECTED'
  reason: string | null
  message: string
  boardedAt: string | null
  ticket?: { code: string; seatLabel: string; passengerName: string | null; channel: 'ONLINE' | 'WALK_IN' }
}

export interface WalkInRequest {
  seatLabel?: string
  passengerName?: string
  phone?: string
  email?: string
  method: 'CASH' | 'MOMO'
  momoPhone?: string
  network?: ApiMomoNetwork
}

/** 201: cash, sold. 202: a mobile money prompt is out; follow `payment`. */
export type WalkInResult =
  | {
      booking: { code: string; seatLabel: string; status: string; totalPesewas: number; passengerName: string | null }
      ticketUrl: string
      payment?: undefined
    }
  | { bookingCode: string; seatLabel: string; payment: ApiPayment; booking?: undefined; ticketUrl?: undefined }

// ─── Calls ───────────────────────────────────────────────────────────────────

export const consoleKey = (bayId?: string | null) => ['agent', 'console', bayId ?? 'first'] as const

export const startLoading = (tripId: string) =>
  api<{ id: string; status: string }>(`/agent/trips/${tripId}/start-loading`, { method: 'POST' })

export const sellWalkIn = (tripId: string, body: WalkInRequest) =>
  api<WalkInResult>(`/agent/trips/${tripId}/walk-ins`, { method: 'POST', body })

export const getWalkInPayment = (paymentId: string) => api<ApiPayment>(`/agent/payments/${paymentId}`)

export const scanTicket = (tripId: string, read: { qrPayload: string } | { code: string }) =>
  api<ApiScan>('/agent/scan', { method: 'POST', body: { tripId, ...read } })

export const boardTicket = (code: string) =>
  api<{ code: string; seatLabel: string; boardedAt: string }>(`/agent/tickets/${encodeURIComponent(code)}/board`, {
    method: 'POST',
  })

/** Throws UNBOARDED_PASSENGERS (details.count) unless `confirmUnboarded`. */
export const departTrip = (tripId: string, confirmUnboarded = false) =>
  api<{ trip: { id: string; status: string }; noShows: number }>(`/agent/trips/${tripId}/depart`, {
    method: 'POST',
    body: { confirmUnboarded },
  })

// ─── The live console ────────────────────────────────────────────────────────

/** The current access token, updating when it's refreshed. */
function useAccessToken() {
  const [token, setToken] = useState(getAccessToken)
  useEffect(() => onAccessTokenChange(setToken), [])
  return token
}

/**
 * One bay's console. The stream sends the whole console after every change
 * at the bay (a sale online, a scan, a departure); a poll every 30 seconds
 * backs it up and keeps the access token fresh for the stream.
 */
export function useAgentConsole(bayId: string | null, enabled: boolean) {
  const queryClient = useQueryClient()
  const token = useAccessToken()
  const key = consoleKey(bayId)
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api<ApiConsole>('/agent/console', { query: { bayId: bayId ?? undefined }, signal }),
    enabled,
    refetchInterval: 30_000,
  })

  useEventStream<ApiConsole>(
    enabled && token && query.data ? '/agent/console/stream' : null,
    { bayId: query.data?.bay.id, accessToken: token },
    {
      event: 'console',
      onMessage: (data) => queryClient.setQueryData(key, data),
      onOpen: () => void queryClient.invalidateQueries({ queryKey: key }),
    },
  )
  return query
}
