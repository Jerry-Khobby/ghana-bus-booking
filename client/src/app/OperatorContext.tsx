import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { agents as seedAgents, buses as seedBuses, layouts as seedLayouts, operatorTrips, routes as seedRoutes } from '@/data/operator'
import type { Bus, LayoutRecord, OperatorTrip, RouteRecord, StationAgent } from '@/data/types'

/*
 * The operator's fleet, timetable and staff. Forms on the operator pages
 * write here so new rows show up straight away; the API will persist them.
 */

interface OperatorState {
  trips: OperatorTrip[]
  buses: Bus[]
  layouts: LayoutRecord[]
  routes: RouteRecord[]
  agents: StationAgent[]
}

interface OperatorContextValue extends OperatorState {
  saveTrip: (trip: OperatorTrip) => void
  addBus: (bus: Bus) => void
  saveLayout: (layout: LayoutRecord) => void
  addRoute: (route: RouteRecord) => void
  setRouteFares: (fares: Record<string, number>) => void
  inviteAgent: (agent: StationAgent) => void
}

const OperatorContext = createContext<OperatorContextValue | null>(null)

/** Insert, or replace the item with the same key. */
function upsert<T>(list: T[], item: T, key: (t: T) => string): T[] {
  const i = list.findIndex((t) => key(t) === key(item))
  return i < 0 ? [item, ...list] : list.map((t, j) => (j === i ? item : t))
}

export function OperatorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OperatorState>({
    trips: operatorTrips,
    buses: seedBuses,
    layouts: seedLayouts,
    routes: seedRoutes,
    agents: seedAgents,
  })

  const value = useMemo<OperatorContextValue>(
    () => ({
      ...state,
      saveTrip: (trip) => setState((s) => ({ ...s, trips: upsert(s.trips, trip, (t) => t.id) })),
      addBus: (bus) => setState((s) => ({ ...s, buses: upsert(s.buses, bus, (b) => b.plate) })),
      saveLayout: (layout) =>
        setState((s) => {
          // Editing keeps the layout's place in the list; a new one goes last.
          const exists = s.layouts.some((l) => l.id === layout.id)
          return { ...s, layouts: exists ? s.layouts.map((l) => (l.id === layout.id ? layout : l)) : [...s.layouts, layout] }
        }),
      addRoute: (route) => setState((s) => ({ ...s, routes: [...s.routes, route] })),
      setRouteFares: (fares) =>
        setState((s) => ({ ...s, routes: s.routes.map((r) => (fares[r.id] !== undefined ? { ...r, fare: fares[r.id] } : r)) })),
      inviteAgent: (agent) => setState((s) => ({ ...s, agents: [...s.agents, agent] })),
    }),
    [state],
  )

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>
}

export function useOperator(): OperatorContextValue {
  const ctx = useContext(OperatorContext)
  if (!ctx) throw new Error('useOperator must be used inside <OperatorProvider>')
  return ctx
}

/** "AC coach — standard · 49" */
export function layoutLabel(layout: LayoutRecord, total: number): string {
  return `${layout.name} · ${total}`
}
