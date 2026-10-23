import { ButtonLink, Mono, ProgressBar } from '@/components/atoms'
import { SeatFill, TripStatusBadge } from '@/components/molecules'
import type { Trip } from '@/data/types'
import { cedis, departureLabel, isBookable, percentSold, seatsLeftLabel, statusLabel } from '@/lib/format'

interface TripResultCardProps {
  trip: Trip
  /** Seats the passenger needs; buses with fewer free seats cannot be booked. */
  passengers: number
}

function shortBusType(t: Trip['busType']) {
  return t === 'Air-conditioned coach' ? 'AC' : t === 'Standard bus' ? 'Standard' : t
}

export function TripResultCard({ trip, passengers }: TripResultCardProps) {
  const bookable = isBookable(trip)
  const enough = trip.seatsLeft >= passengers
  const closedLabel = trip.status === 'full' ? 'Full' : trip.status === 'departed' ? 'Departed' : 'Not enough seats'

  const action =
    bookable && enough ? (
      <ButtonLink to={`/trips/${trip.id}/seat`} className="min-h-11 rounded-[10px]">
        {passengers > 1 ? `Choose ${passengers} seats` : 'Choose seat'}
      </ButtonLink>
    ) : (
      <span className="flex min-h-11 items-center justify-center rounded-[10px] bg-sunken px-[18px] font-semibold text-muted">
        {closedLabel}
      </span>
    )

  return (
    <article className="rounded-[14px] border border-line bg-surface">
      {/* Phone */}
      <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <TripStatusBadge status={trip.status} label={statusLabel(trip)} />
          <span className="font-display text-[17px] font-bold">{cedis(trip.fare)}</span>
        </div>
        <div>
          <h2 className="m-0 font-display text-lg font-bold leading-snug">{departureLabel(trip)}</h2>
          <p className="m-0 mt-0.5 text-sm text-muted">
            {trip.operator} · {shortBusType(trip.busType)} · <Mono>{trip.plate}</Mono>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ProgressBar className="flex-1" size="sm" value={percentSold(trip)} tone={bookable ? 'brand' : 'inactive'} />
          <span className="whitespace-nowrap text-sm font-semibold">
            {trip.seatsLeft === 0 ? closedLabel : `${trip.seatsLeft} left`}
          </span>
        </div>
        {bookable && <div className="grid *:min-h-12">{action}</div>}
      </div>

      {/* Tablet: details and price side by side, seat bar across the bottom. */}
      <div className="hidden grid-cols-2 gap-x-5 gap-y-3.5 p-[18px] md:grid lg:hidden">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <TripStatusBadge status={trip.status} label={statusLabel(trip)} />
            <Mono className="text-[13px] text-muted">{trip.plate}</Mono>
          </div>
          <h2 className="m-0 font-display text-xl font-bold">{departureLabel(trip)}</h2>
          <p className="m-0 text-sm text-muted">
            {trip.operator} · {trip.busType}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="font-display text-xl font-bold">{cedis(trip.fare)}</div>
          {action}
        </div>
        <div className="col-span-2 flex items-center gap-3.5">
          <ProgressBar className="flex-1" value={percentSold(trip)} tone={bookable ? 'brand' : 'inactive'} />
          <span className="whitespace-nowrap text-sm text-muted">
            <strong className="text-ink">{seatsLeftLabel(trip.seatsLeft)}</strong> of {trip.capacity}
          </span>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden flex-wrap items-center gap-5 p-5 lg:flex">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <TripStatusBadge status={trip.status} label={statusLabel(trip)} />
            <Mono className="text-[13px] text-muted">{trip.plate}</Mono>
          </div>
          <h2 className="m-0 font-display text-[22px] font-bold">{departureLabel(trip)}</h2>
          <p className="m-0 text-[15px] text-muted">
            {trip.operator} · {trip.busType}
          </p>
        </div>
        <div className="flex-[1_1_180px]">
          <SeatFill capacity={trip.capacity} seatsLeft={trip.seatsLeft} inactive={!bookable} />
        </div>
        <div className="ml-auto flex flex-[0_1_200px] flex-col items-end gap-2.5">
          <div className="font-display text-xl font-bold">{cedis(trip.fare)}</div>
          {action}
        </div>
      </div>
    </article>
  )
}
