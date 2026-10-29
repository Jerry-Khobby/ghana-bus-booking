import { useQueries, useQuery } from '@tanstack/react-query'
import type { PassengerTicket, TicketState } from '@/data/types'
import { getTicket, type ApiTicket } from './booking'
import { hhmm, pesewasToCedis } from './catalog'
import { api } from './client'

/* "My tickets": the account's list when signed in, this device's otherwise. */

export interface ApiMyTicket {
  code: string
  status: 'CONFIRMED' | 'BOARDED' | 'NO_SHOW'
  badge: string
  seatLabel: string
  tripId: string
  totalPesewas: number
  boardedAt: string | null
  operator: { name: string }
  route: { origin: { name: string; city: string }; destination: { name: string; city: string } }
  bus: { plate: string }
  bay: { number: number }
  mode: 'FIXED_TIME' | 'WHEN_FULL'
  departureAt: string | null
  loadingStartsAt: string | null
  leaveBy: string | null
}

type TicketLike = Pick<
  ApiMyTicket,
  'code' | 'status' | 'seatLabel' | 'totalPesewas' | 'boardedAt' | 'route' | 'bus' | 'bay' | 'mode' | 'departureAt' | 'loadingStartsAt' | 'leaveBy'
> & { tripStatus?: string; tripId?: string }

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Accra' })
const today = () => dayFormat.format(new Date())

function day(iso: string | null) {
  if (!iso) return ''
  const d = dayFormat.format(new Date(iso))
  return d === today() ? 'Today' : d
}

function stateOf(t: TicketLike, loadingNow: boolean): TicketState {
  if (t.status === 'BOARDED') return 'used'
  if (t.status === 'NO_SHOW' || t.tripStatus === 'DEPARTED') return 'not-used'
  return loadingNow ? 'loading' : 'scheduled'
}

/** An account or device ticket in the shape the "My tickets" card draws. */
export function toPassengerTicket(t: TicketLike, loadingNow: boolean): PassengerTicket {
  const state = stateOf(t, loadingNow)
  const start = t.departureAt ?? t.loadingStartsAt
  const time =
    state === 'used' && t.boardedAt
      ? `boarded ${hhmm(t.boardedAt)}`
      : t.mode === 'FIXED_TIME'
        ? `departs ${hhmm(t.departureAt)}`
        : 'leaves when full'
  return {
    code: t.code,
    tripId: t.tripId,
    route: `${t.route.origin.city} → ${t.route.destination.city}`,
    when: `${day(state === 'used' ? t.boardedAt : start)} · ${time}`,
    seat: t.seatLabel,
    plate: t.bus.plate,
    paid: pesewasToCedis(t.totalPesewas),
    state,
    bay: t.bay.number,
    note:
      state === 'used'
        ? 'Boarded and scanned'
        : state === 'not-used'
          ? 'Bus left without this ticket being scanned'
          : undefined,
  }
}

/** Signed in: one page (up to 50) of upcoming or past tickets. */
export function useMyTickets(scope: 'upcoming' | 'past', enabled: boolean) {
  return useQuery({
    queryKey: ['me', 'tickets', scope],
    queryFn: ({ signal }) =>
      api<{ items: ApiMyTicket[]; nextCursor: string | null }>('/me/tickets', { query: { scope, limit: 50 }, signal }),
    enabled,
    select: (page) =>
      page.items.map((t) => toPassengerTicket({ ...t, tripStatus: undefined }, t.badge.startsWith('Loading'))),
  })
}

/** Signed out: the tickets this device paid for, each opened with its link token. */
export function useDeviceTickets(tickets: { code: string; ticketToken: string; tripId: string }[], enabled: boolean) {
  return useQueries({
    queries: tickets.map((t) => ({
      queryKey: ['tickets', t.code, t.ticketToken] as const,
      queryFn: () => getTicket(t.code, { t: t.ticketToken }),
      enabled,
      retry: false,
    })),
    combine: (results) => ({
      pending: results.some((r) => r.isPending && r.fetchStatus !== 'idle'),
      tickets: results.flatMap((r, i) =>
        r.data ? [toPassengerTicket({ ...(r.data as ApiTicket), tripId: tickets[i].tripId }, r.data.tripStatus === 'LOADING')] : [],
      ),
    }),
  })
}
