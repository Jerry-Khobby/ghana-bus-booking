import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useAgentConsole, type ApiConsole } from '@/api/agent'
import { api } from '@/api/client'
import { readStored, writeStored } from '@/lib/storage'
import { useAuth } from './AuthContext'

/*
 * The station agent's view of their bays: which bay they are looking at
 * (remembered between visits) and that bay's live console from the API.
 * Only fetched while a staff member is signed in.
 */

export type WalkInPayment = 'cash' | 'momo'

interface StationContextValue {
  /** The bay chosen in the header; null means the first of theirs. */
  bayId: string | null
  setBay: (bayId: string) => void
  console: UseQueryResult<ApiConsole>
}

const BAY_KEY = 'seatline.agent.bay'

const StationContext = createContext<StationContextValue | null>(null)

export function StationProvider({ children }: { children: ReactNode }) {
  const { staff } = useAuth()
  const [bayId, setBayId] = useState<string | null>(() => readStored<string>(BAY_KEY, 'local'))
  const consoleQuery = useAgentConsole(bayId, !!staff && staff.role !== 'platform')

  // A remembered bay they no longer work: fall back to their first
  const bays = consoleQuery.data?.bays
  useEffect(() => {
    if (bays && bayId && !bays.some((b) => b.id === bayId)) setBayId(null)
  }, [bays, bayId])

  // No bay chosen yet and the first one is empty: open on one with a bus, once
  const firstEmpty = !bayId && !!consoleQuery.data && !consoleQuery.data.trip
  const [looked, setLooked] = useState(false)
  useEffect(() => {
    if (!firstEmpty || looked || !bays || bays.length < 2) return
    setLooked(true)
    void (async () => {
      for (const bay of bays.slice(1)) {
        const other = await api<ApiConsole>('/agent/console', { query: { bayId: bay.id } }).catch(() => null)
        if (other?.trip) {
          setBayId(bay.id)
          return
        }
      }
    })()
  }, [firstEmpty, looked, bays])

  const value = useMemo<StationContextValue>(
    () => ({
      bayId,
      setBay: (id) => {
        setBayId(id)
        writeStored(BAY_KEY, id, 'local')
      },
      console: consoleQuery,
    }),
    [bayId, consoleQuery],
  )

  return <StationContext.Provider value={value}>{children}</StationContext.Provider>
}

export function useStation(): StationContextValue {
  const ctx = useContext(StationContext)
  if (!ctx) throw new Error('useStation must be used inside <StationProvider>')
  return ctx
}
