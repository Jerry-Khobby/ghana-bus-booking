import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { MomoNetwork, PaymentMethod, Ticket } from '@/data/types'
import { HOLD_SECONDS, MAX_SEATS } from '@/lib/seats'

/*
 * Client-side booking state for the passenger flow.
 * When the API exists, `toggleSeat` and `confirmPayment` become server calls:
 * the server owns the hold timer and issues the ticket codes.
 */

interface BookingState {
  /** Passengers chosen on the search form; the seat page asks for this many seats. */
  passengers: number
  tripId: string | null
  /** Seats held for this booking, in the order they were picked. */
  seats: number[]
  /** One timer covers every held seat. It starts with the first seat. */
  holdExpiresAt: number | null
  method: PaymentMethod
  network: MomoNetwork
  phone: string
  tickets: Ticket[]
}

export type ToggleResult = 'added' | 'removed' | 'limit'

interface BookingContextValue extends BookingState {
  setPassengers: (n: number) => void
  toggleSeat: (tripId: string, seat: number) => ToggleResult
  releaseSeats: () => void
  setMethod: (m: PaymentMethod) => void
  setNetwork: (n: MomoNetwork) => void
  setPhone: (p: string) => void
  confirmPayment: () => Ticket[]
}

const initial: BookingState = {
  passengers: 1,
  tripId: null,
  seats: [],
  holdExpiresAt: null,
  method: 'momo',
  network: 'MTN',
  phone: '',
  tickets: [],
}

const BookingContext = createContext<BookingContextValue | null>(null)

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookingState>(initial)

  const toggleSeat = useCallback(
    (tripId: string, seat: number): ToggleResult => {
      // Seats on another bus are dropped when the passenger switches buses.
      const current = state.tripId === tripId ? state.seats : []
      if (current.includes(seat)) {
        const seats = current.filter((s) => s !== seat)
        setState((s) => ({ ...s, tripId, seats, holdExpiresAt: seats.length ? s.holdExpiresAt : null }))
        return 'removed'
      }
      if (current.length >= MAX_SEATS) return 'limit'
      setState((s) => ({
        ...s,
        tripId,
        seats: [...current, seat],
        holdExpiresAt: current.length && s.holdExpiresAt ? s.holdExpiresAt : Date.now() + HOLD_SECONDS * 1000,
        tickets: [],
      }))
      return 'added'
    },
    [state.tripId, state.seats],
  )

  const releaseSeats = useCallback(() => {
    setState((s) => ({ ...s, seats: [], holdExpiresAt: null }))
  }, [])

  const confirmPayment = useCallback((): Ticket[] => {
    if (!state.tripId || state.seats.length === 0) return []
    const tripId = state.tripId
    const tickets = [...state.seats]
      .sort((a, b) => a - b)
      .map<Ticket>((seat, i) => ({
        code: makeTicketCode(),
        tripId,
        seat,
        passengerName: `Passenger ${i + 1}`,
        phone: state.phone,
      }))
    setState((s) => ({ ...s, tickets, seats: [], holdExpiresAt: null }))
    return tickets
  }, [state.tripId, state.seats, state.phone])

  const value = useMemo<BookingContextValue>(
    () => ({
      ...state,
      toggleSeat,
      releaseSeats,
      confirmPayment,
      setPassengers: (passengers) => setState((s) => ({ ...s, passengers })),
      setMethod: (method) => setState((s) => ({ ...s, method })),
      setNetwork: (network) => setState((s) => ({ ...s, network })),
      setPhone: (phone) => setState((s) => ({ ...s, phone })),
    }),
    [state, toggleSeat, releaseSeats, confirmPayment],
  )

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking must be used inside <BookingProvider>')
  return ctx
}

function makeTicketCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  return `SL-${pick(4)}-${pick(2)}`
}
