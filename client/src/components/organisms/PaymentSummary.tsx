import { Card, Divider, Icon } from '@/components/atoms'
import { HoldTimer, InfoNote } from '@/components/molecules'
import type { Trip } from '@/data/types'
import { cedis, mmss, seatList } from '@/lib/format'
import { seatPosition } from '@/lib/seats'

interface PaymentSummaryProps {
  trip: Trip
  seats: number[]
  /** Service fee per seat. */
  fee: number
  secondsLeft: number | null
}

export function paymentTotal(trip: Trip, seats: number[], fee: number) {
  return (trip.fare + fee) * seats.length
}

function sorted(seats: number[]) {
  return [...seats].sort((a, b) => a - b)
}

/** Fare and fee lines shared by every summary variant. */
function PriceLines({ trip, seats, fee, tone }: Omit<PaymentSummaryProps, 'secondsLeft'> & { tone: 'dark' | 'light' }) {
  const label = tone === 'dark' ? 'text-on-dark' : 'text-muted'
  const n = seats.length
  return (
    <>
      <dt className={label}>{n > 1 ? `Fare · ${n} × ${cedis(trip.fare)}` : 'Fare'}</dt>
      <dd className="m-0 text-right">{cedis(trip.fare * n)}</dd>
      <dt className={label}>{n > 1 ? `Service fee · ${n} × ${cedis(fee)}` : 'Service fee'}</dt>
      <dd className="m-0 text-right">{cedis(fee * n)}</dd>
    </>
  )
}

/** Desktop: dark card beside the payment form. */
export function PaymentSummary({ trip, seats, fee, secondsLeft }: PaymentSummaryProps) {
  return (
    <aside aria-label="Summary" className="hidden w-[360px] shrink-0 flex-col gap-4 lg:flex">
      <Card tone="dark" className="flex flex-col gap-3.5 !p-[22px]">
        {secondsLeft !== null && <HoldTimer secondsLeft={secondsLeft} tone="dark" plural={seats.length > 1} />}
        <div>
          <p className="m-0 font-display text-[22px] font-bold">
            {trip.from.city} → {trip.to.city}
          </p>
          <p className="m-0 mt-0.5 text-[15px] text-on-dark">
            {trip.operator} · {trip.plate}
            {trip.bay ? ` · bay ${trip.bay}` : ''}
          </p>
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
          {sorted(seats).map((s, i) => (
            <div key={s} className="contents">
              <dt className="text-on-dark">{i === 0 ? (seats.length > 1 ? 'Seats' : 'Seat') : ''}</dt>
              <dd className="m-0 text-right font-mono font-semibold">
                {s} · {seatPosition(s)}
              </dd>
            </div>
          ))}
          <PriceLines trip={trip} seats={seats} fee={fee} tone="dark" />
        </dl>
        <Divider tone="dark" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">Total</span>
          <span className="font-display text-[26px] font-extrabold">{cedis(paymentTotal(trip, seats, fee))}</span>
        </div>
      </Card>
      <InfoNote>If the payment fails or the timer runs out, the seats go back on sale and you are not charged.</InfoNote>
    </aside>
  )
}

/** Tablet: one dark strip above the form with trip, timer and total. */
export function PaymentSummaryStrip({ trip, seats, fee, secondsLeft }: PaymentSummaryProps) {
  return (
    <section
      aria-label="Summary"
      className="hidden grid-cols-3 items-center gap-4 rounded-2xl bg-ink px-5 py-[18px] text-white md:grid lg:hidden"
    >
      <div className="min-w-0">
        <p className="m-0 font-display text-[19px] font-bold">
          {trip.from.city} → {trip.to.city}
        </p>
        <p className="m-0 text-sm text-on-dark">
          {trip.plate}
          {trip.bay ? ` · bay ${trip.bay}` : ''} · {seats.length > 1 ? 'seats' : 'seat'} {seatList(seats)}
        </p>
      </div>
      <p className="m-0 text-center text-[15px] font-semibold text-gold">
        {secondsLeft !== null && (
          <>
            Held for <span className="font-mono">{mmss(secondsLeft)}</span>
          </>
        )}
      </p>
      <div className="text-right">
        <p className="m-0 text-[13px] text-on-dark">Total incl. fees {cedis(fee * seats.length)}</p>
        <p className="m-0 font-display text-2xl font-extrabold">{cedis(paymentTotal(trip, seats, fee))}</p>
      </div>
    </section>
  )
}

/** Phone: collapsible order summary above the form. */
export function PaymentSummaryDisclosure({ trip, seats, fee }: Omit<PaymentSummaryProps, 'secondsLeft'>) {
  return (
    <details className="group rounded-[14px] border border-line bg-surface px-3.5 md:hidden">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2.5 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name="chevronDown" size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          <span className="truncate">
            {trip.from.city} → {trip.to.city} · {seats.length > 1 ? 'seats' : 'seat'} {seatList(seats)}
          </span>
        </span>
        <span className="shrink-0 font-display font-bold">{cedis(paymentTotal(trip, seats, fee))}</span>
      </summary>
      <dl className="m-0 mb-3.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted">Bus</dt>
        <dd className="m-0 text-right">
          {trip.operator} · {trip.plate}
        </dd>
        <dt className="text-muted">Boarding</dt>
        <dd className="m-0 text-right">
          {trip.bay ? `Bay ${trip.bay} · ` : ''}
          {trip.departsAt ? `departs ${trip.departsAt}` : 'leaves when full'}
        </dd>
        <dt className="text-muted">{seats.length > 1 ? 'Seats' : 'Seat'}</dt>
        <dd className="m-0 text-right font-mono">
          {sorted(seats)
            .map((s) => `${s} · ${seatPosition(s)}`)
            .join(', ')}
        </dd>
        <PriceLines trip={trip} seats={seats} fee={fee} tone="light" />
      </dl>
    </details>
  )
}
