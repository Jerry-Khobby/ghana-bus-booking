import { Link } from 'react-router'
import { Mono } from '@/components/atoms'
import type { Trip } from '@/data/types'
import { TripStatusBadge } from './TripStatusBadge'
import { SeatFill } from './SeatFill'

/** Compact card for the home page "Loading now" grid. */
export function TripCard({ trip }: { trip: Trip }) {
  const badge = trip.status === 'loading' ? `Loading · bay ${trip.bay}` : `Scheduled · ${trip.departsAt}`
  return (
    <Link
      to={`/trips/${trip.id}/seat`}
      className="flex flex-col gap-3.5 rounded-[14px] border border-line bg-surface p-5 text-ink no-underline transition-shadow hover:text-ink hover:shadow-[0_8px_24px_rgba(22,32,28,0.08)]"
    >
      <div className="flex items-center justify-between gap-2">
        <TripStatusBadge status={trip.status} label={badge} />
        <Mono className="text-[13px] text-muted">{trip.plate}</Mono>
      </div>
      <div className="font-display text-[22px] font-bold">
        {trip.from.city} → {trip.to.city}
      </div>
      <SeatFill
        capacity={trip.capacity}
        seatsLeft={trip.seatsLeft}
        note={trip.status === 'loading' ? 'Leaves when full' : `Departs ${trip.departsAt}`}
      />
    </Link>
  )
}
