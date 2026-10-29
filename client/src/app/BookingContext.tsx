import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  createHold,
  getHold,
  getPayment,
  payHold,
  releaseHold,
  type ApiMomoNetwork,
  type ApiPaidTicket,
  type ApiPayment,
} from '@/api/booking'
import { catalogKeys } from '@/api/catalog'
import { isApiError, isNetworkError, newIdempotencyKey } from '@/api/client'
import type { MomoNetwork, PaymentMethod } from '@/data/types'
import { bySeat } from '@/lib/format'
import { MAX_SEATS } from '@/lib/seats'
import { readStored, writeStored } from '@/lib/storage'

/*
 * The passenger's booking. The server owns the seats: every pick or unpick
 * replaces the hold with one holding exactly the seats now chosen, on one
 * timer. The hold token proves it is this browser's hold, so it is kept for
 * the tab (a reload keeps the seats). Tickets bought on this device are
 * remembered in localStorage for "My tickets" when signed out.
 */

export interface Hold {
  holdId: string
  holdToken: string
  tripId: string
  seats: string[]
  /** epoch ms */
  expiresAt: number
  /** Per seat, in pesewas. */
  farePesewas: number
  feePesewas: number
  totalPesewas: number
}

/** A ticket this device paid for, with what opens it without signing in. */
export interface DeviceTicket extends ApiPaidTicket {
  tripId: string
}

interface BookingState {
  /** Passengers chosen on the search form; the seat page asks for this many seats. */
  passengers: number
  hold: Hold | null
  /** The payment under way for the hold, if any. */
  paymentId: string | null
  method: PaymentMethod
  network: MomoNetwork
  phone: string
  email: string
  name: string
  /** Tickets from the most recent payment. */
  tickets: DeviceTicket[]
  /** Every ticket bought on this device, newest first. */
  history: DeviceTicket[]
}

export type ToggleResult = 'added' | 'removed' | 'limit'

interface BookingContextValue extends BookingState {
  /** The hold's trip, for pages that only show seats on their own trip. */
  tripId: string | null
  seats: string[]
  holdExpiresAt: number | null
  /** A seat change is being saved. */
  saving: boolean
  setPassengers: (n: number) => void
  /** Picks or unpicks a seat. Throws ApiError (SEAT_TAKEN, TRIP_NOT_BOOKABLE…) if the server says no. */
  toggleSeat: (tripId: string, seat: string) => Promise<ToggleResult>
  /** Lets go of every held seat. */
  releaseSeats: () => Promise<void>
  /** Re-reads the hold, e.g. after a failed payment; drops it if it has ended. */
  refreshHold: () => Promise<Hold | null>
  setMethod: (m: PaymentMethod) => void
  setNetwork: (n: MomoNetwork) => void
  setPhone: (p: string) => void
  setEmail: (e: string) => void
  setName: (n: string) => void
  /** Starts paying for the hold with the form's details. */
  pay: () => Promise<ApiPayment>
  /** Payment went through: keep the tickets and forget the hold. */
  completePayment: (payment: ApiPayment) => DeviceTicket[]
}

const NETWORKS: Record<MomoNetwork, ApiMomoNetwork> = { MTN: 'MTN', Telecel: 'TELECEL', AT: 'AIRTELTIGO' }

const HOLD_KEY = 'seatline.hold'
const HISTORY_KEY = 'seatline.tickets'

type FormFields = Pick<BookingState, 'method' | 'network' | 'phone' | 'email' | 'name'>

interface Saved {
  hold: Hold | null
  paymentId: string | null
  /** The card page reloads the app; the form comes back as it was. */
  form?: FormFields
}

const initial = (): BookingState => {
  const saved = readStored<Saved>(HOLD_KEY, 'session')
  const hold = saved?.hold && saved.hold.expiresAt > Date.now() ? saved.hold : null
  return {
    passengers: 1,
    hold,
    paymentId: hold ? (saved?.paymentId ?? null) : null,
    method: 'momo',
    network: 'MTN',
    phone: '',
    email: '',
    name: '',
    ...saved?.form,
    tickets: [],
    history: readStored<DeviceTicket[]>(HISTORY_KEY, 'local') ?? [],
  }
}

const BookingContext = createContext<BookingContextValue | null>(null)

function toHold(res: Awaited<ReturnType<typeof createHold>>): Hold {
  return {
    holdId: res.holdId,
    holdToken: res.holdToken,
    tripId: res.tripId,
    seats: res.seatLabels,
    expiresAt: new Date(res.expiresAt).getTime(),
    farePesewas: res.farePesewas,
    feePesewas: res.feePesewas,
    totalPesewas: res.totalPesewas,
  }
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<BookingState>(initial)
  const [saving, setSaving] = useState(false)
  // Seat taps queue up: each change starts from the hold the last one made
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const latest = useRef(state)
  latest.current = state

  useEffect(() => {
    const { hold, paymentId, method, network, phone, email, name } = state
    writeStored(HOLD_KEY, { hold, paymentId, form: { method, network, phone, email, name } } satisfies Saved, 'session')
  }, [state])
  useEffect(() => {
    writeStored(HISTORY_KEY, state.history.slice(0, 50), 'local')
  }, [state.history])

  const refreshSeats = useCallback(
    (tripId: string) => queryClient.invalidateQueries({ queryKey: ['trips', tripId] }),
    [queryClient],
  )

  /** Runs seat changes one at a time, in the order they were tapped. */
  const queue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const run = chain.current.then(work, work)
    chain.current = run.catch(() => undefined)
    return run
  }, [])

  const setSeats = useCallback(
    async (tripId: string, seats: string[]) => {
      const current = latest.current.hold
      setSaving(true)
      try {
        // A hold on another bus is let go first; one on this bus is replaced
        if (current && current.tripId !== tripId) {
          await releaseHold(current.holdId, current.holdToken).catch(() => undefined)
        }
        const sameTrip = current?.tripId === tripId ? current : null
        let hold: Hold | null = null
        if (seats.length) {
          hold = toHold(await createHold(tripId, seats, sameTrip?.holdToken))
        } else if (sameTrip) {
          await releaseHold(sameTrip.holdId, sameTrip.holdToken).catch((error: unknown) => {
            // Already gone is fine; anything else (a payment in progress) is not
            if (!isApiError(error, 'HOLD_EXPIRED') && !isApiError(error, 'NOT_FOUND')) throw error
          })
        }
        setState((s) => ({ ...s, hold, paymentId: null, tickets: [] }))
        return hold
      } finally {
        setSaving(false)
        void refreshSeats(tripId)
      }
    },
    [refreshSeats],
  )

  const toggleSeat = useCallback(
    (tripId: string, seat: string) =>
      queue(async (): Promise<ToggleResult> => {
        const hold = latest.current.hold
        const current = hold?.tripId === tripId ? hold.seats : []
        if (current.includes(seat)) {
          await setSeats(
            tripId,
            current.filter((s) => s !== seat),
          )
          return 'removed'
        }
        if (current.length >= MAX_SEATS) return 'limit'
        await setSeats(tripId, [...current, seat].sort(bySeat))
        return 'added'
      }),
    [queue, setSeats],
  )

  const releaseSeats = useCallback(
    () =>
      queue(async () => {
        const hold = latest.current.hold
        if (hold) await setSeats(hold.tripId, [])
      }),
    [queue, setSeats],
  )

  const refreshHold = useCallback(async () => {
    const hold = latest.current.hold
    if (!hold) return null
    try {
      const fresh = await getHold(hold.holdId, hold.holdToken)
      const open = fresh.status === 'HELD' || fresh.status === 'PENDING_PAYMENT'
      const next = open ? { ...hold, expiresAt: Date.now() + (fresh.secondsLeft ?? 0) * 1000 } : null
      setState((s) => ({ ...s, hold: next, paymentId: next ? s.paymentId : null }))
      return next
    } catch {
      setState((s) => ({ ...s, hold: null, paymentId: null }))
      return null
    }
  }, [])

  const pay = useCallback(async () => {
    const s = latest.current
    const hold = s.hold
    if (!hold) throw new Error('No seats are held')
    let payment: ApiPayment
    try {
      payment = await payHold(
        hold.holdId,
        hold.holdToken,
        {
          method: s.method === 'momo' ? 'MOMO' : 'CARD',
          ...(s.method === 'momo' && { phone: s.phone, network: NETWORKS[s.network] }),
          contactEmail: s.email.trim(),
          passengerName: s.name.trim() || undefined,
        },
        newIdempotencyKey(),
      )
    } catch (error) {
      // The reply never arrived, even after retries. The payment may well have
      // started (or finished): the hold knows, so pick it up from there.
      if (!isNetworkError(error)) throw error
      const fresh = await getHold(hold.holdId, hold.holdToken).catch(() => null)
      if (!fresh?.payment) throw error
      payment = await getPayment(fresh.payment.id, hold.holdToken)
    }
    setState((st) => ({ ...st, paymentId: payment.paymentId }))
    return payment
  }, [])

  const completePayment = useCallback(
    (payment: ApiPayment) => {
      const tripId = latest.current.hold?.tripId ?? ''
      const tickets = payment.tickets.map((t) => ({ ...t, tripId }))
      setState((s) => ({
        ...s,
        tickets,
        history: [...tickets, ...s.history.filter((h) => !tickets.some((t) => t.code === h.code))],
        hold: null,
        paymentId: null,
      }))
      if (tripId) void refreshSeats(tripId)
      void queryClient.invalidateQueries({ queryKey: catalogKeys.loadingNow() })
      return tickets
    },
    [queryClient, refreshSeats],
  )

  const value = useMemo<BookingContextValue>(
    () => ({
      ...state,
      tripId: state.hold?.tripId ?? null,
      seats: state.hold?.seats ?? [],
      holdExpiresAt: state.hold?.expiresAt ?? null,
      saving,
      toggleSeat,
      releaseSeats,
      refreshHold,
      pay,
      completePayment,
      setPassengers: (passengers) => setState((s) => ({ ...s, passengers })),
      setMethod: (method) => setState((s) => ({ ...s, method })),
      setNetwork: (network) => setState((s) => ({ ...s, network })),
      setPhone: (phone) => setState((s) => ({ ...s, phone })),
      setEmail: (email) => setState((s) => ({ ...s, email })),
      setName: (name) => setState((s) => ({ ...s, name })),
    }),
    [state, saving, toggleSeat, releaseSeats, refreshHold, pay, completePayment],
  )

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking must be used inside <BookingProvider>')
  return ctx
}
