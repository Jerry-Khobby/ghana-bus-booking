import { Link } from 'react-router'
import { Mono, ProgressBar } from '@/components/atoms'
import type { Trip } from '@/data/types'
import { percentSold, seatsLeftLabel, timeLabel } from '@/lib/format'
import { TripStatusBadge } from './TripStatusBadge'
import { SeatFill } from './SeatFill'

/** Card for the home page "Loading now" row: compact on phones and tablets, fuller on desktop. */
export function TripCard({ trip }: { trip: Trip }) {
  const loading = trip.status === 'loading'
  const badge = loading ? `Loading · bay ${trip.bay}` : `Scheduled · ${timeLabel(trip)}`
  return (
    <Link
      to={`/trips/${trip.id}/seat`}
      className="flex h-full flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-4 text-ink no-underline transition-shadow hover:text-ink hover:shadow-[0_8px_24px_rgba(22,32,28,0.08)] md:gap-3 md:p-[18px] lg:gap-3.5 lg:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <TripStatusBadge status={trip.status} label={badge} />
        <Mono className="hidden text-[13px] text-muted md:inline">{trip.plate}</Mono>
      </div>
      <div className="font-display text-xl font-bold md:text-[21px] lg:text-[22px]">
        {trip.from.city} → {trip.to.city}
      </div>

      {/* Phones and tablets: one-line footer, as in their designs. */}
      <div className="flex flex-col gap-2 lg:hidden">
        <ProgressBar value={percentSold(trip)} size="sm" className="md:h-2.5" />
        <span className="text-sm text-muted">
          <strong className="text-ink">{seatsLeftLabel(trip.seatsLeft)}</strong>
          {loading && trip.whenFull ? ' · leaves when full' : ` of ${trip.capacity}`}
        </span>
      </div>

      <div className="hidden lg:block">
        <SeatFill capacity={trip.capacity} seatsLeft={trip.seatsLeft} note={trip.whenFull ? 'Leaves when full' : `Departs ${trip.departsAt}`} />
      </div>
    </Link>
  )
}
