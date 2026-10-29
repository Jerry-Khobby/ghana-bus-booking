import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BusType, SeatStatus, Trip, TripStatus } from '@/data/types'
import { api } from './client'
import { useEventStream } from './stream'

/* Public browsing: stations, trips and seat maps, as the API sends them. */

// ─── What the API sends ──────────────────────────────────────────────────────

export interface ApiStation {
  id: string
  name: string
  city: string
  region: string
}

export type ApiBusType = 'AC_COACH' | 'STANDARD' | 'MINIBUS'
export type ApiTripStatus = 'SCHEDULED' | 'LOADING' | 'FULL' | 'DEPARTED' | 'CANCELLED'

export interface ApiTripSummary {
  id: string
  operator: { name: string; serviceFeePesewas?: number }
  bus: { plate: string; type: ApiBusType }
  mode: 'FIXED_TIME' | 'WHEN_FULL'
  status: ApiTripStatus
  departureAt: string | null
  loadingStartsAt: string | null
  leaveBy: string | null
  bay: { number: number }
  farePesewas: number
  currency: 'GHS'
  seatsLeft: number
  seatsTotal: number
  /** On loading-now and single-trip reads; search already knows the route. */
  route?: { origin: ApiStation; destination: ApiStation; durationMinutes?: number | null }
}

export type ApiSeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD' | 'BLOCKED' | 'MINE'

export interface ApiSeatCell {
  r: number
  c: number
  type: 'SEAT' | 'AISLE' | 'DRIVER' | 'DOOR' | 'EMPTY'
  label?: string
  status?: ApiSeatStatus
}

export interface ApiSeatMap {
  rows: number
  cols: number
  cells: ApiSeatCell[]
}

// ─── Into the shapes the screens use ─────────────────────────────────────────

const BUS_TYPES: Record<ApiBusType, BusType> = {
  AC_COACH: 'Air-conditioned coach',
  STANDARD: 'Standard bus',
  MINIBUS: 'Minibus',
}
export const API_BUS_TYPE = Object.fromEntries(Object.entries(BUS_TYPES).map(([k, v]) => [v, k])) as Record<
  BusType,
  ApiBusType
>

const TRIP_STATUSES: Record<ApiTripStatus, TripStatus> = {
  SCHEDULED: 'scheduled',
  LOADING: 'loading',
  FULL: 'full',
  DEPARTED: 'departed',
  CANCELLED: 'departed',
}

/** Ghana keeps GMT all year; times are shown in Accra time whatever the device says. */
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })

export function hhmm(iso: string | null | undefined): string | undefined {
  return iso ? timeFormat.format(new Date(iso)) : undefined
}

export const pesewasToCedis = (pesewas: number) => pesewas / 100

/** A trip from the API in the shape the cards, banners and summaries draw. */
export function toTrip(t: ApiTripSummary, route?: { origin: ApiStation; destination: ApiStation }): Trip {
  const stations = t.route ?? route
  const whenFull = t.mode === 'WHEN_FULL'
  return {
    id: t.id,
    from: stations ? { city: stations.origin.city, name: stations.origin.name } : { city: '', name: '' },
    to: stations ? { city: stations.destination.city, name: stations.destination.name } : { city: '', name: '' },
    plate: t.bus.plate,
    operator: t.operator.name,
    busType: BUS_TYPES[t.bus.type],
    status: TRIP_STATUSES[t.status],
    bay: t.bay.number,
    whenFull,
    departsAt: hhmm(whenFull ? null : t.departureAt) ?? (t.status === 'DEPARTED' ? hhmm(t.leaveBy) : undefined),
    loadsAt: hhmm(t.loadingStartsAt),
    leaveBy: hhmm(t.leaveBy),
    capacity: t.seatsTotal,
    seatsLeft: t.seatsLeft,
    fare: pesewasToCedis(t.farePesewas),
    fee: t.operator.serviceFeePesewas === undefined ? undefined : pesewasToCedis(t.operator.serviceFeePesewas),
  }
}

const SEAT_STATUSES: Record<ApiSeatStatus, SeatStatus> = {
  AVAILABLE: 'free',
  MINE: 'mine',
  HELD: 'held',
  SOLD: 'taken',
  BLOCKED: 'taken',
}
export const toSeatStatus = (status: ApiSeatStatus | undefined): SeatStatus => SEAT_STATUSES[status ?? 'BLOCKED']

// ─── Reads ───────────────────────────────────────────────────────────────────

export const catalogKeys = {
  stations: ['stations'] as const,
  loadingNow: (from?: string) => ['trips', 'loading-now', from ?? 'all'] as const,
  search: (q: TripSearch) => ['trips', 'search', q] as const,
  trip: (id: string) => ['trips', id] as const,
  seats: (id: string, holdToken?: string | null) => ['trips', id, 'seats', holdToken ?? null] as const,
}

/** The From / To pickers. Stations rarely change, so they're kept a while. */
export function useStations() {
  return useQuery({
    queryKey: catalogKeys.stations,
    queryFn: ({ signal }) => api<ApiStation[]>('/stations', { signal }),
    staleTime: 10 * 60_000,
  })
}

/** Home: buses loading now and the next to leave today. Refreshed every 30 s. */
export function useLoadingNow(from?: string) {
  return useQuery({
    queryKey: catalogKeys.loadingNow(from),
    queryFn: ({ signal }) => api<ApiTripSummary[]>('/trips/loading-now', { query: { from, limit: 6 }, signal }),
    select: (trips) => trips.map((t) => toTrip(t)),
    refetchInterval: 30_000,
  })
}

export interface TripSearch {
  from: string
  to: string
  /** YYYY-MM-DD */
  date: string
}

/** Buses on the route that day. */
export function useTripSearch(search: TripSearch | null) {
  return useQuery({
    queryKey: catalogKeys.search(search ?? { from: '', to: '', date: '' }),
    queryFn: ({ signal }) => api<ApiTripSummary[]>('/trips/search', { query: { ...search! }, signal }),
    enabled: !!search,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  })
}

/** One trip, with its route and the operator's service fee. */
export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.trip(id ?? ''),
    queryFn: ({ signal }) => api<ApiTripSummary>(`/trips/${id}`, { signal }),
    enabled: !!id,
    select: (t) => toTrip(t),
  })
}

/**
 * The seat map, kept live: each `seat` event patches one seat in the cache.
 * With a hold token, the caller's own held seats come back as MINE.
 */
export function useSeatMap(tripId: string | undefined, holdToken?: string | null) {
  const queryClient = useQueryClient()
  const key = catalogKeys.seats(tripId ?? '', holdToken)
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api<ApiSeatMap>(`/trips/${tripId}/seats`, { holdToken: holdToken ?? undefined, signal }),
    enabled: !!tripId,
  })

  useEventStream<{ label: string; status: ApiSeatStatus }>(
    tripId ? `/trips/${tripId}/seats/stream` : null,
    { holdToken: holdToken ?? undefined },
    {
      event: 'seat',
      onMessage: (seat) =>
        queryClient.setQueryData<ApiSeatMap>(key, (map) =>
          map && {
            ...map,
            cells: map.cells.map((cell) => (cell.label === seat.label ? { ...cell, status: seat.status } : cell)),
          },
        ),
      // Reconnected after a drop: re-read whatever changed meanwhile
      onOpen: () => void queryClient.invalidateQueries({ queryKey: key }),
    },
  )
  return query
}
