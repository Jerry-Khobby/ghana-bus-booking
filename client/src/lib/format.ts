import type { Trip } from '@/data/types'

export function cedis(amount: number): string {
  return `GH¢ ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
      return trip.eta ? `Leaves when full · ${trip.eta}` : 'Leaves when full'
    case 'scheduled':
      return `Departs ${trip.departsAt}`
    case 'full':
      return `Leaving now · bay ${trip.bay}`
    case 'departed':
      return `Left at ${trip.departsAt}`
  }
}

export function isBookable(trip: Trip): boolean {
  return trip.status === 'loading' || trip.status === 'scheduled'
}

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** [14] → "14", [14, 15] → "14 and 15", [3, 14, 15] → "3, 14 and 15" */
export function seatList(seats: number[]): string {
  const sorted = [...seats].sort((a, b) => a - b).map(String)
  if (sorted.length <= 1) return sorted[0] ?? '—'
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
