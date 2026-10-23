import type { Bus, LayoutRecord, OperatorTrip, RouteRecord, StationAgent } from './types'

/*
 * Operator-side sample data (Coastline Express) standing in for the API.
 * Fares and sales figures are placeholders, not real prices.
 */

export const OPERATOR_NAME = 'Coastline Express'

export const operatorTrips: OperatorTrip[] = [
  { id: 'gr-4471-24', route: 'Accra → Kumasi', plate: 'GR 4471-24', when: 'When full', bay: 6, status: 'loading', sold: 41, capacity: 49, fare: 150 },
  { id: 'gr-1190-25', route: 'Accra → Kumasi', plate: 'GR 1190-25', when: '14:30', bay: 6, status: 'scheduled', sold: 27, capacity: 49, fare: 150 },
  { id: 'gw-2290-23', route: 'Accra → Cape Coast', plate: 'GW 2290-23', when: 'When full', bay: 2, status: 'loading', sold: 22, capacity: 49, fare: 90 },
  { id: 'gr-3015-24', route: 'Accra → Takoradi', plate: 'GR 3015-24', when: '15:00', bay: 3, status: 'scheduled', sold: 12, capacity: 49, fare: 130 },
  { id: 'gw-5521-24', route: 'Accra → Kumasi', plate: 'GW 5521-24', when: 'Leaving now', bay: 3, status: 'full', sold: 49, capacity: 49, fare: 120 },
  { id: 'gr-6610-21', route: 'Accra → Kumasi', plate: 'GR 6610-21', when: '09:00', bay: 6, status: 'departed', sold: 49, capacity: 49, fare: 150 },
  { id: 'gr-7742-25', route: 'Accra → Tamale', plate: 'GR 7742-25', when: '06:00', bay: 1, status: 'departed', sold: 46, capacity: 49, fare: 280 },
]

/** Payments that failed or timed out today; their seats went back on sale. */
export const failedPaymentsToday = 3

export const layouts: LayoutRecord[] = [
  { id: 'ac-standard', name: 'AC coach — standard', layout: { left: 2, right: 2, rows: 11, backRow: true } },
  { id: 'standard-23', name: 'Standard bus 2+3', layout: { left: 2, right: 3, rows: 11, backRow: true } },
  { id: 'minibus-21', name: 'Minibus 2+1', layout: { left: 2, right: 1, rows: 6, backRow: false } },
]

export const buses: Bus[] = [
  { plate: 'GR 4471-24', type: 'Air-conditioned coach', layoutId: 'ac-standard', status: 'active', next: 'Loading now · bay 6' },
  { plate: 'GR 1190-25', type: 'Air-conditioned coach', layoutId: 'ac-standard', status: 'active', next: 'Today 14:30 · Kumasi' },
  { plate: 'GW 2290-23', type: 'Air-conditioned coach', layoutId: 'ac-standard', status: 'active', next: 'Loading now · bay 2' },
  { plate: 'GR 3015-24', type: 'Air-conditioned coach', layoutId: 'ac-standard', status: 'active', next: 'Today 15:00 · Takoradi' },
  { plate: 'GR 7742-25', type: 'Air-conditioned coach', layoutId: 'ac-standard', status: 'active', next: 'On the road · Tamale' },
  { plate: 'GR 6610-21', type: 'Standard bus', layoutId: 'standard-23', status: 'workshop', next: 'Back Mon 26 Oct' },
]

export const routes: RouteRecord[] = [
  { id: 'acc-kum', name: 'Accra → Kumasi', stations: 'Circle → Asafo', tripsToday: 9, fare: 150 },
  { id: 'acc-cc', name: 'Accra → Cape Coast', stations: 'Circle → Cape Coast main', tripsToday: 4, fare: 90 },
  { id: 'acc-tak', name: 'Accra → Takoradi', stations: 'Circle → Takoradi main', tripsToday: 3, fare: 130 },
  { id: 'acc-tam', name: 'Accra → Tamale', stations: 'Circle → Tamale main', tripsToday: 1, fare: 280 },
]

export const agents: StationAgent[] = [
  { id: 'kofi', name: 'Kofi A.', email: 'kofi.a@coastline.example', station: 'Accra — Circle', bays: '4–6', status: 'active', lastActive: 'Now' },
  { id: 'akosua', name: 'Akosua M.', email: 'akosua.m@coastline.example', station: 'Accra — Circle', bays: '1–3', status: 'active', lastActive: '12 min ago' },
  { id: 'yaw', name: 'Yaw D.', email: 'yaw.d@coastline.example', station: 'Kumasi — Asafo', bays: '1–4', status: 'active', lastActive: 'Today 08:40' },
  { id: 'esi', name: 'Esi T.', email: 'esi.t@coastline.example', station: 'Cape Coast', bays: '1–2', status: 'active', lastActive: 'Yesterday' },
  { id: 'kwame', name: 'Kwame O.', email: 'kwame.o@coastline.example', station: 'Accra — Circle', bays: '7–8', status: 'invited', lastActive: 'Not signed in yet' },
]

export const stations = ['Accra — Circle', 'Kumasi — Asafo', 'Cape Coast']

export const bayOptions = [6, 5, 4, 3, 2, 1]

/* ---------- Reports ---------- */

export type ReportRange = 'today' | '7d' | '30d'

export interface DailySales {
  /** ISO date */
  date: string
  online: number
  walkIn: number
  noShows: number
}

/** The last day the sample report covers. */
export const REPORT_END = '2026-10-22'

/** Thirty days of sample ticket sales, oldest first, ending on REPORT_END. */
export const dailySales: DailySales[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(`${REPORT_END}T12:00`)
  d.setDate(d.getDate() - (29 - i))
  // Stable, gently varying sample numbers; Friday to Sunday run busier.
  const busy = [0, 5, 6].includes(d.getDay())
  return {
    date: d.toISOString().slice(0, 10),
    online: 110 + ((i * 37) % 60) + (busy ? 40 : 0),
    walkIn: 40 + ((i * 23) % 30) + (busy ? 15 : 0),
    noShows: 2 + ((i * 7) % 5),
  }
})

/** Share of tickets per route, used to split totals in the "By route" table. */
export const routeShare = [
  { route: 'Accra → Kumasi', share: 0.52, tripsPerDay: 9, fill: 91, fare: 150 },
  { route: 'Accra → Cape Coast', share: 0.24, tripsPerDay: 4, fill: 78, fare: 90 },
  { route: 'Accra → Takoradi', share: 0.16, tripsPerDay: 3, fill: 72, fare: 130 },
  { route: 'Accra → Tamale', share: 0.08, tripsPerDay: 1, fill: 94, fare: 280 },
]

/** Share of walk-in cash sales per agent. */
export const cashShare = [
  { agent: 'Kofi A.', share: 0.38 },
  { agent: 'Akosua M.', share: 0.29 },
  { agent: 'Yaw D.', share: 0.21 },
  { agent: 'Esi T.', share: 0.12 },
]
