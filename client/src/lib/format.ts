import type { Trip } from '@/data/types'

/** GH¢ with pesewas; `whole` drops them for big report totals. */
export function cedis(amount: number, { whole = false }: { whole?: boolean } = {}): string {
  const digits = whole ? 0 : 2
  return `GH¢ ${amount.toLocaleString('en-GH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

export function percentSold(trip: Pick<Trip, 'capacity' | 'seatsLeft'>): number {
  return Math.round(((trip.capacity - trip.seatsLeft) / trip.capacity) * 100)
}

export function seatsLeftLabel(left: number): string {
  if (left === 0) return 'No seats left'
  return `${left} seat${left === 1 ? '' : 's'} left`
}

export function statusLabel(trip: Trip): string {
  switch (trip.status) {
    case 'loading':
      return `Loading · bay ${trip.bay}`
    case 'scheduled':
      return 'Scheduled'
    case 'full':
      return 'Full'
    case 'departed':
      return `Departed ${trip.departsAt ?? ''}`.trim()
  }
}

export function departureLabel(trip: Trip): string {
  switch (trip.status) {
    case 'loading':
      if (!trip.whenFull && trip.departsAt) return `Departs ${trip.departsAt}`
      if (trip.eta) return `Leaves when full · ${trip.eta}`
      return trip.leaveBy ? `Leaves when full · by ${trip.leaveBy}` : 'Leaves when full'
    case 'scheduled':
      if (trip.whenFull) return trip.loadsAt ? `Boards from ${trip.loadsAt} · leaves when full` : 'Leaves when full'
      return `Departs ${trip.departsAt}`
    case 'full':
      return `Leaving now · bay ${trip.bay}`
    case 'departed':
      return trip.departsAt ? `Left at ${trip.departsAt}` : 'Departed'
  }
}

/** Short time for badges: "14:30", or when a fill-and-go bus starts boarding. */
export function timeLabel(trip: Trip): string {
  return trip.departsAt ?? (trip.loadsAt ? `boards ${trip.loadsAt}` : 'when full')
}

export function isBookable(trip: Trip): boolean {
  return trip.status === 'loading' || trip.status === 'scheduled'
}

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Seat labels in bus order: "2" before "10", and "1A" after "1". */
export function bySeat(a: string | number, b: string | number): number {
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

/** [14] → "14", [14, 15] → "14 and 15", [3, 14, 15] → "3, 14 and 15" */
export function seatList(seats: Array<number | string>): string {
  const sorted = [...seats].sort(bySeat).map(String)
  if (sorted.length <= 1) return sorted[0] ?? '—'
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
