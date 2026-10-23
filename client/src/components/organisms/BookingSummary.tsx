import { ButtonLink, Card, Divider, Eyebrow } from '@/components/atoms'
import { HoldTimer } from '@/components/molecules'
import type { Trip } from '@/data/types'
import { cedis, departureLabel, mmss, plural, seatList } from '@/lib/format'

interface BookingSummaryProps {
  trip: Trip
  seats: number[]
  /** How many seats the passenger said they need on the search form. */
  passengers: number
  secondsLeft: number | null
}

function pickPrompt(picked: number, passengers: number) {
  if (picked === 0) return passengers > 1 ? `Tap ${passengers} free seats to continue` : 'Tap a free seat to continue'
  return null
}

/** Shown under the seat count when the number picked differs from the passengers searched for. */
function countNote(picked: number, passengers: number) {
  if (picked === 0 || picked === passengers) return null
  return picked < passengers
    ? `You searched for ${plural(passengers, 'passenger')}. Pick ${passengers - picked} more, or continue with ${plural(picked, 'seat')}.`
    : `That's more seats than the ${plural(passengers, 'passenger')} you searched for. You can still continue.`
}

export function BookingSummary({ trip, seats, passengers, secondsLeft }: BookingSummaryProps) {
  const prompt = pickPrompt(seats.length, passengers)
  const note = countNote(seats.length, passengers)
  return (
    <Card className="flex flex-col gap-3.5 !p-[22px]">
      <div>
        <Eyebrow>Your trip</Eyebrow>
        <p className="m-0 mt-1 font-display text-[22px] font-bold">
          {trip.from.city} → {trip.to.city}
        </p>
        <p className="m-0 mt-0.5 text-[15px] text-muted">
          {trip.operator} · {trip.busType === 'Air-conditioned coach' ? 'AC coach' : trip.busType} · {trip.plate}
        </p>
        <p className="m-0 mt-0.5 text-[15px] text-muted">{departureLabel(trip)}</p>
      </div>
      <Divider />
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">{seats.length > 1 ? 'Seats' : 'Seat'}</span>
        <span className="text-right font-mono text-[28px] font-semibold leading-tight" aria-live="polite">
          {seatList(seats)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">Fare</span>
        <span className="text-right">
          {seats.length > 1 && (
            <span className="mr-2 text-sm text-muted">
              {seats.length} × {cedis(trip.fare)}
            </span>
          )}
          <span className="font-display text-xl font-bold">{cedis(trip.fare * Math.max(1, seats.length))}</span>
        </span>
      </div>
      {note && <p className="m-0 text-sm text-muted">{note}</p>}
      {prompt === null && secondsLeft !== null ? (
        <>
          <HoldTimer secondsLeft={secondsLeft} plural={seats.length > 1} />
          <ButtonLink to={`/trips/${trip.id}/pay`} size="lg">
            Continue to payment
          </ButtonLink>
        </>
      ) : (
        <p className="m-0 flex min-h-[52px] items-center justify-center rounded-xl bg-sunken px-4 text-center font-semibold text-muted">
          {prompt}
        </p>
      )}
    </Card>
  )
}

/** Content of the sticky bottom bar used on phones instead of the side summary. */
export function MobileSeatBar({ trip, seats, passengers, secondsLeft }: BookingSummaryProps) {
  const prompt = pickPrompt(seats.length, passengers)
  return (
    <div aria-label="Your seats" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 truncate text-[13px] text-muted">
            {seats.length > 1 ? 'Seats' : 'Seat'}{' '}
            <span className="font-mono text-lg font-semibold text-ink">{seatList(seats)}</span>
          </p>
          {secondsLeft !== null && seats.length > 0 && (
            <p className="m-0 text-[13px] font-semibold text-brand-ink">
              Held for you · <span className="font-mono">{mmss(secondsLeft)}</span>
            </p>
          )}
        </div>
        <span className="shrink-0 font-display text-[19px] font-bold">{cedis(trip.fare * Math.max(1, seats.length))}</span>
      </div>
      {prompt === null ? (
        <ButtonLink to={`/trips/${trip.id}/pay`} size="lg">
          Continue to payment
        </ButtonLink>
      ) : (
        <p className="m-0 flex min-h-[52px] items-center justify-center rounded-xl bg-sunken font-semibold text-muted">
          {passengers > 1 ? prompt : 'Tap a free seat'}
        </p>
      )}
    </div>
  )
}
