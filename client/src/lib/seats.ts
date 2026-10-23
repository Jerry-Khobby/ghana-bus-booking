import { demoSeatMap } from '@/data/mock'
import type { SeatLayout, SeatStatus, Trip } from '@/data/types'

export const HOLD_SECONDS = 5 * 60

/** Most seats one booking can hold at a time. */
export const MAX_SEATS = 6

export type { SeatLayout }

export const defaultLayout: SeatLayout = { left: 2, right: 2, rows: 11, backRow: true }

export interface SeatRow {
  left: number[]
  right: number[]
}

/** Seats are numbered front to back, left to right. */
export function buildRows(layout: SeatLayout): { rows: SeatRow[]; back: number[]; total: number } {
  let n = 1
  const rows: SeatRow[] = []
  for (let r = 0; r < layout.rows; r++) {
    const left = Array.from({ length: layout.left }, () => n++)
    const right = Array.from({ length: layout.right }, () => n++)
    rows.push({ left, right })
  }
  const back = layout.backRow ? Array.from({ length: layout.left + layout.right + 1 }, () => n++) : []
  return { rows, back, total: n - 1 }
}

export function seatPosition(seat: number, layout: SeatLayout = defaultLayout): 'window' | 'aisle' | 'back row' {
  const perRow = layout.left + layout.right
  if (seat > layout.rows * perRow) return 'back row'
  const col = (seat - 1) % perRow
  return col === 0 || col === perRow - 1 ? 'window' : 'aisle'
}

/**
 * Seat states for a trip. The demo bus uses the fixed map from the design;
 * other trips get a stable spread of free seats that matches `seatsLeft`.
 */
export function seatStatuses(trip: Trip): Map<number, Exclude<SeatStatus, 'mine'>> {
  const map = new Map<number, Exclude<SeatStatus, 'mine'>>()
  for (let i = 1; i <= trip.capacity; i++) map.set(i, 'taken')

  if (trip.id === 'gr-4471-24') {
    demoSeatMap.free.forEach((s) => map.set(s, 'free'))
    demoSeatMap.held.forEach((s) => map.set(s, 'held'))
    return map
  }

  const order = Array.from({ length: trip.capacity }, (_, i) => i + 1).sort(
    (a, b) => hash(trip.id, a) - hash(trip.id, b),
  )
  order.slice(0, trip.seatsLeft).forEach((s) => map.set(s, 'free'))
  return map
}

function hash(seed: string, n: number): number {
  let h = 2166136261
  for (const ch of seed + n) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
