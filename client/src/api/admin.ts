import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { BusStatus, BusType, OperatorTrip, TripStatus } from '@/data/types'
import { API_BUS_TYPE, hhmm, pesewasToCedis, type ApiBusType, type ApiTripStatus } from './catalog'
import { api, ApiError, apiUrl, getAccessToken, refreshSession } from './client'

/* The operator admin's side: timetable, fleet, network, staff and reports. */

type Place = { id?: string; name: string; city: string }
type Mode = 'FIXED_TIME' | 'WHEN_FULL'

// ─── Trips ───────────────────────────────────────────────────────────────────

export interface ApiAdminTrip {
  id: string
  route: { id: string; origin: Place; destination: Place; baseFarePesewas?: number; durationMinutes?: number | null }
  bus?: { id: string; plate: string }
  plate?: string
  bay: { id: string; number: number }
  mode: Mode
  status: ApiTripStatus
  when: string | null
  departureAt?: string | null
  loadingStartsAt?: string | null
  leaveBy?: string | null
  farePesewas?: number
  onlineBookingOpen?: boolean
  sold: number
  total: number
  editable?: boolean
  revenuePesewas?: number
}

export interface ApiOverview {
  date: string
  ticketsSold: number
  revenuePesewas: number
  seatFillPercent: number
  failedPayments: number
  trips: ApiAdminTrip[]
}

const STATUS: Record<ApiTripStatus, TripStatus> = {
  SCHEDULED: 'scheduled',
  LOADING: 'loading',
  FULL: 'full',
  DEPARTED: 'departed',
  CANCELLED: 'departed',
}
export const API_TRIP_STATUS: Record<TripStatus, ApiTripStatus> = {
  scheduled: 'SCHEDULED',
  loading: 'LOADING',
  full: 'FULL',
  departed: 'DEPARTED',
}

export const routeName = (r: { origin: Place; destination: Place }) => `${r.origin.city} → ${r.destination.city}`

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Accra' })
const isToday = (iso: string) => dayFormat.format(new Date(iso)) === dayFormat.format(new Date())

/** "14:30", "Fri 30 Oct 14:30", or "When full" for fill-and-go. */
function whenLabel(t: ApiAdminTrip) {
  if (t.status === 'CANCELLED') return 'Cancelled'
  const at = t.mode === 'FIXED_TIME' ? t.when : null
  if (!at) return t.mode === 'WHEN_FULL' && t.status === 'FULL' ? 'Leaving now' : 'When full'
  return isToday(at) ? hhmm(at)! : `${dayFormat.format(new Date(at))} ${hhmm(at)}`
}

/** A trip in the shape the trips table draws. */
export function toOperatorTrip(t: ApiAdminTrip): OperatorTrip & { revenue?: number; editable: boolean; cancelled: boolean } {
  return {
    id: t.id,
    route: routeName(t.route),
    plate: t.bus?.plate ?? t.plate ?? '',
    when: whenLabel(t),
    bay: t.bay.number,
    status: STATUS[t.status],
    sold: t.sold,
    capacity: t.total,
    fare: pesewasToCedis(t.farePesewas ?? 0),
    revenue: t.revenuePesewas === undefined ? undefined : pesewasToCedis(t.revenuePesewas),
    editable: t.editable ?? (t.status === 'SCHEDULED' || t.status === 'LOADING'),
    cancelled: t.status === 'CANCELLED',
  }
}

export interface TripsFilter {
  date?: string
  from?: string
  to?: string
  routeId?: string
  status?: ApiTripStatus[]
}

export interface TripBody {
  routeId: string
  busId: string
  bayId: string
  mode: Mode
  departureAt?: string
  loadingStartsAt?: string
  leaveBy?: string
  farePesewas?: number
  onlineBookingOpen?: boolean
}

export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  trips: (f: TripsFilter) => ['admin', 'trips', f] as const,
  trip: (id: string) => ['admin', 'trip', id] as const,
  buses: ['admin', 'buses'] as const,
  layouts: ['admin', 'layouts'] as const,
  layout: (id: string) => ['admin', 'layout', id] as const,
  routes: ['admin', 'routes'] as const,
  bays: ['admin', 'bays'] as const,
  agents: ['admin', 'agents'] as const,
  cash: ['admin', 'cash'] as const,
  report: (name: string, range: string) => ['admin', 'reports', name, range] as const,
}

export function useOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: ({ signal }) => api<ApiOverview>('/admin/overview', { signal }),
    refetchInterval: 30_000,
  })
}

export function useAdminTrips(filter: TripsFilter) {
  return useQuery({
    queryKey: adminKeys.trips(filter),
    queryFn: ({ signal }) =>
      api<{ items: ApiAdminTrip[]; nextCursor: string | null }>('/admin/trips', {
        query: { ...filter, limit: 100 },
        signal,
      }),
    refetchInterval: 30_000,
  })
}

export function useAdminTrip(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.trip(id ?? ''),
    queryFn: ({ signal }) => api<ApiAdminTrip>(`/admin/trips/${id}`, { signal }),
    enabled: !!id,
  })
}

export const createTrip = (body: TripBody) => api<ApiAdminTrip>('/admin/trips', { method: 'POST', body })
export const updateTrip = (id: string, body: Partial<TripBody>) =>
  api<ApiAdminTrip>(`/admin/trips/${id}`, { method: 'PATCH', body })
export const cancelTrip = (id: string, reason: string) =>
  api<{ id: string; refundsPending: number; cashToRepay: unknown[] }>(`/admin/trips/${id}/cancel`, {
    method: 'POST',
    body: { reason },
  })

// ─── Fleet ───────────────────────────────────────────────────────────────────

export interface ApiBus {
  id: string
  plate: string
  type: ApiBusType
  status: 'ACTIVE' | 'IN_WORKSHOP' | 'RETIRED' | string
  backInServiceOn: string | null
  layout: { id: string; name: string; seatCount: number }
  nextTrip: {
    id: string
    status: ApiTripStatus
    mode: Mode
    departureAt: string | null
    loadingStartsAt: string | null
    bay: { number: number }
    route: { destinationStation: { city: string } }
  } | null
}

export interface ApiLayoutCell {
  r: number
  c: number
  type: 'SEAT' | 'AISLE' | 'DRIVER' | 'DOOR' | 'EMPTY'
  label?: string
}

export interface ApiLayout {
  id: string
  name: string
  rows: number
  cols: number
  seatCount: number
  version: number
  cells: ApiLayoutCell[]
  busesUsing: number
}

export const BUS_TYPE_NAMES: Record<ApiBusType, BusType> = {
  AC_COACH: 'Air-conditioned coach',
  STANDARD: 'Standard bus',
  MINIBUS: 'Minibus',
}
export { API_BUS_TYPE }

export const busStatusOf = (s: ApiBus['status']): BusStatus => (s === 'ACTIVE' ? 'active' : 'workshop')

/** Where the bus is or goes next, e.g. "Loading now · bay 6" or "Today 14:30 · Kumasi". */
export function busNext(b: ApiBus): string {
  if (b.status !== 'ACTIVE') {
    return b.backInServiceOn
      ? `Back ${dayFormat.format(new Date(`${b.backInServiceOn.slice(0, 10)}T12:00:00Z`))}`
      : 'In the workshop'
  }
  const t = b.nextTrip
  if (!t) return 'No trips booked'
  if (t.status === 'LOADING' || t.status === 'FULL') return `Loading now · bay ${t.bay.number}`
  const at = t.departureAt ?? t.loadingStartsAt
  const day = at && isToday(at) ? 'Today' : at ? dayFormat.format(new Date(at)) : ''
  return `${day} ${hhmm(at) ?? ''} · ${t.route.destinationStation.city}`.trim()
}

export function useBuses() {
  return useQuery({ queryKey: adminKeys.buses, queryFn: ({ signal }) => api<ApiBus[]>('/admin/buses', { signal }) })
}
export const createBus = (body: { plate: string; type: ApiBusType; layoutId: string }) =>
  api<ApiBus>('/admin/buses', { method: 'POST', body })
export const updateBus = (
  id: string,
  body: { type?: ApiBusType; layoutId?: string; status?: string; backInServiceOn?: string | null },
) => api<ApiBus>(`/admin/buses/${id}`, { method: 'PATCH', body })

export function useLayouts() {
  return useQuery({ queryKey: adminKeys.layouts, queryFn: ({ signal }) => api<ApiLayout[]>('/admin/layouts', { signal }) })
}
export function useLayout(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.layout(id ?? ''),
    queryFn: ({ signal }) => api<ApiLayout>(`/admin/layouts/${id}`, { signal }),
    enabled: !!id,
  })
}
export type LayoutBody = Pick<ApiLayout, 'name' | 'rows' | 'cols' | 'cells'>
export const createLayout = (body: LayoutBody) => api<ApiLayout>('/admin/layouts', { method: 'POST', body })
export const saveLayout = (id: string, body: LayoutBody) => api<ApiLayout>(`/admin/layouts/${id}`, { method: 'PUT', body })
export const archiveLayout = (id: string) => api<unknown>(`/admin/layouts/${id}/archive`, { method: 'POST' })

// ─── Network ─────────────────────────────────────────────────────────────────

export interface ApiRoute {
  id: string
  baseFarePesewas: number
  durationMinutes: number | null
  active: boolean
  origin: Place & { id: string }
  destination: Place & { id: string }
  tripsToday: number
}

export interface ApiBay {
  id: string
  number: number
  station: Place & { id: string }
}

export function useRoutes() {
  return useQuery({ queryKey: adminKeys.routes, queryFn: ({ signal }) => api<ApiRoute[]>('/admin/routes', { signal }) })
}
export const createRoute = (body: {
  originStationId: string
  destinationStationId: string
  baseFarePesewas: number
  durationMinutes?: number
}) => api<ApiRoute>('/admin/routes', { method: 'POST', body })
export const updateFares = (fares: { routeId: string; baseFarePesewas: number }[]) =>
  api<unknown>('/admin/routes/fares', { method: 'PATCH', body: { fares } })
export const updateRoute = (id: string, body: { durationMinutes?: number; active?: boolean }) =>
  api<ApiRoute>(`/admin/routes/${id}`, { method: 'PATCH', body })

export function useBays() {
  return useQuery({ queryKey: adminKeys.bays, queryFn: ({ signal }) => api<ApiBay[]>('/admin/bays', { signal }) })
}
export const createBay = (body: { stationId: string; number: number }) => api<ApiBay>('/admin/bays', { method: 'POST', body })

// ─── Agents and cash ─────────────────────────────────────────────────────────

export interface ApiAgent {
  id: string
  name: string
  email: string
  status: 'ACTIVE' | 'INVITED' | 'DISABLED'
  lastActiveAt: string | null
  station: Place & { id: string }
  bays: { id: string; number: number }[]
}

/** Cash an agent took and still holds. */
export interface ApiCash {
  agent: { id: string; name: string; email: string }
  tickets: number
  amountPesewas: number
  oldest: string | null
}

export function useAgents() {
  return useQuery({ queryKey: adminKeys.agents, queryFn: ({ signal }) => api<ApiAgent[]>('/admin/agents', { signal }) })
}
export const inviteAgent = (body: { name: string; email: string; stationId: string; bayIds: string[] }) =>
  api<ApiAgent & { inviteUrl?: string }>('/admin/agents', { method: 'POST', body })
export const updateAgent = (id: string, body: { stationId?: string; bayIds?: string[]; status?: 'ACTIVE' | 'DISABLED' }) =>
  api<ApiAgent>(`/admin/agents/${id}`, { method: 'PATCH', body })
export const resetAgentPassword = (id: string) =>
  api<{ sent: true; resetUrl?: string }>(`/admin/agents/${id}/reset-password`, { method: 'POST' })
export const resendAgentInvite = (id: string) =>
  api<{ sent: true; inviteUrl?: string }>(`/admin/agents/${id}/resend-invite`, { method: 'POST' })

export function useUnsettledCash() {
  return useQuery({
    queryKey: adminKeys.cash,
    queryFn: ({ signal }) => api<ApiCash[]>('/admin/cash', { query: { status: 'unsettled' }, signal }),
  })
}
/** The admin collected the agent's cash, up to now. */
export const settleCash = (agentId: string) =>
  api<unknown>('/admin/cash/settle', { method: 'POST', body: { agentId, upTo: new Date().toISOString() } })

// ─── Reports ─────────────────────────────────────────────────────────────────

export type ReportRange = 'today' | '7d' | '30d'

export interface ApiReportSummary {
  from: string
  to: string
  revenuePesewas: number
  ticketsSold: number
  avgSeatFillPercent: number
  noShows: number
}
export interface ApiDaily {
  date: string
  online: number
  walkIn: number
}
export interface ApiRouteReport {
  route: { id: string; origin: Place; destination: Place }
  trips: number
  seatFillPercent: number
  revenuePesewas: number
}
export interface ApiCashReport {
  agent: { id: string; name: string; email: string }
  tickets: number
  cashPesewas: number
  unsettledPesewas: number
}

function useReport<T>(name: string, range: ReportRange) {
  return useQuery({
    queryKey: adminKeys.report(name, range),
    queryFn: ({ signal }) => api<T>(`/reports/${name}`, { query: { range }, signal }),
  })
}
export const useReportSummary = (range: ReportRange) => useReport<ApiReportSummary>('summary', range)
export const useReportDaily = (range: ReportRange) => useReport<ApiDaily[]>('daily', range)
export const useReportByRoute = (range: ReportRange) => useReport<ApiRouteReport[]>('by-route', range)
export const useReportCash = (range: ReportRange) => useReport<ApiCashReport[]>('cash-by-agent', range)

/** Saves the CSV of every ticket sold in the range. */
export async function downloadReportCsv(range: ReportRange) {
  const send = (token: string | null) =>
    fetch(apiUrl('/reports/export.csv', { range }), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
  let res = await send(getAccessToken())
  if (res.status === 401) res = await send(await refreshSession())
  if (!res.ok) throw new ApiError(res.status, 'INTERNAL', 'Could not export the report. Try again.')
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: `seatline-sales-${range}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

/** Re-reads everything on the admin side after a change. */
export function useRefreshAdmin() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: adminKeys.all })
}
