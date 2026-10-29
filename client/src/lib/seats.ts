import type { SeatLayout } from '@/data/types'

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

/* ---------- The API's layout grid ---------- */

export interface LayoutCell {
  r: number
  c: number
  type: 'SEAT' | 'AISLE' | 'DRIVER' | 'DOOR' | 'EMPTY'
  label?: string
}

/**
 * The grid the API stores for a coach shape: driver and door across the
 * front, an aisle between the left and right seats, and an optional back
 * row across the aisle. Seats are numbered as buildRows numbers them.
 */
export function toCells(layout: SeatLayout): { rows: number; cols: number; cells: LayoutCell[] } {
  const cols = layout.left + 1 + layout.right
  const rows = 1 + layout.rows + (layout.backRow ? 1 : 0)
  const cells: LayoutCell[] = []
  let label = 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0) cells.push({ r, c, type: c === 0 ? 'DRIVER' : c === cols - 1 ? 'DOOR' : 'EMPTY' })
      else if (c === layout.left && r <= layout.rows) cells.push({ r, c, type: 'AISLE' })
      else cells.push({ r, c, type: 'SEAT', label: String(label++) })
    }
  }
  return { rows, cols, cells }
}

/** The coach shape a grid was made from, or null for a grid drawn some other way. */
export function fromCells(rows: number, cols: number, cells: LayoutCell[]): SeatLayout | null {
  const aisle = cells.find((c) => c.r === 1 && c.type === 'AISLE')
  if (!aisle) return null
  const backRow = !cells.some((c) => c.r === rows - 1 && c.type === 'AISLE')
  const shape: SeatLayout = { left: aisle.c, right: cols - aisle.c - 1, rows: rows - 1 - (backRow ? 1 : 0), backRow }
  if (shape.rows < 1 || shape.right < 0) return null
  // Only call it that shape if drawing the shape gives back the same grid
  const redrawn = toCells(shape)
  const same =
    redrawn.rows === rows &&
    redrawn.cells.length === cells.length &&
    redrawn.cells.every((cell) => {
      const other = cells.find((o) => o.r === cell.r && o.c === cell.c)
      return other?.type === cell.type && (cell.type !== 'SEAT' || other.label === cell.label)
    })
  return same ? shape : null
}
