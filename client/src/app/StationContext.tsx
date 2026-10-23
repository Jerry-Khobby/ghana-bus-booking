import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { agentBays } from '@/data/mock'

/*
 * The station agent's live view of their bays: which bay they are looking at,
 * which seats on the loading bus are still free, and boarding progress.
 * The API will push these changes over a socket; here they live in memory.
 */

export type WalkInPayment = 'cash' | 'momo'

export interface WalkInSale {
  seat: number
  name: string
  phone: string
  payment: WalkInPayment
  printed: boolean
}

interface StationState {
  bay: number
  /** Free seat numbers on the bus loading at bay 6, lowest first. */
  freeSeats: number[]
  departed: boolean
  scanned: number
  sales: WalkInSale[]
}

interface StationContextValue extends StationState {
  bays: number[]
  /** Trip id loading at the selected bay, if any. */
  tripId: string | null
  sold: number
  capacity: number
  setBay: (bay: number) => void
  sellWalkIn: (sale: WalkInSale) => void
  markDeparted: () => void
  markBoarded: () => void
}

const CAPACITY = 49

const StationContext = createContext<StationContextValue | null>(null)

export function StationProvider({ children }: { children: ReactNode }) {
  const bays = useMemo(() => Object.keys(agentBays).map(Number).sort((a, b) => b - a), [])
  const [state, setState] = useState<StationState>({
    bay: bays[0],
    freeSeats: [3, 14, 15, 30, 37, 45, 48, 49],
    departed: false,
    scanned: 33,
    sales: [],
  })

  const sellWalkIn = useCallback((sale: WalkInSale) => {
    setState((s) => ({ ...s, freeSeats: s.freeSeats.filter((n) => n !== sale.seat), sales: [...s.sales, sale] }))
  }, [])

  const value = useMemo<StationContextValue>(
    () => ({
      ...state,
      bays,
      tripId: agentBays[state.bay] ?? null,
      capacity: CAPACITY,
      sold: CAPACITY - state.freeSeats.length,
      setBay: (bay) => setState((s) => ({ ...s, bay })),
      sellWalkIn,
      markDeparted: () => setState((s) => ({ ...s, departed: true })),
      markBoarded: () => setState((s) => ({ ...s, scanned: s.scanned + 1 })),
    }),
    [state, bays, sellWalkIn],
  )

  return <StationContext.Provider value={value}>{children}</StationContext.Provider>
}

export function useStation(): StationContextValue {
  const ctx = useContext(StationContext)
  if (!ctx) throw new Error('useStation must be used inside <StationProvider>')
  return ctx
}
