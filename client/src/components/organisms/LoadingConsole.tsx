import { Button, ButtonLink, Heading, Icon, ProgressBar } from '@/components/atoms'
import type { Trip } from '@/data/types'
import { cx } from '@/lib/format'

interface LoadingConsoleProps {
  trip: Trip
  /** Seat numbers still free on this bus. */
  freeSeats: number[]
  departed: boolean
  onDepart: () => void
}

/** The bus currently loading at the agent's bay, with walk-in sales and boarding controls. */
export function LoadingConsole({ trip, freeSeats, departed, onDepart }: LoadingConsoleProps) {
  const sold = trip.capacity - freeSeats.length
  const full = freeSeats.length === 0
  const closed = departed || full
  const banner = departed
    ? { text: 'Departed', cls: 'bg-sunken text-taken-ink' }
    : full
      ? { text: 'Full — ready to leave', cls: 'bg-ink text-white' }
      : { text: `Loading now · bay ${trip.bay}`, cls: 'bg-gold text-gold-ink' }

  return (
    <section aria-labelledby="now-h" className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className={cx('flex items-center justify-between gap-3 px-4 py-3 sm:px-6', banner.cls)}>
        <span className="font-bold" aria-live="polite">
          {banner.text}
        </span>
        <span className="font-mono font-semibold">{trip.plate}</span>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex items-end justify-between gap-2.5 md:flex-wrap md:gap-4">
          <div className="min-w-0">
            <Heading as="h1" size="xl" id="now-h" className="text-2xl md:text-[30px] lg:text-[34px]">
              {trip.from.city} → {trip.to.city}
            </Heading>
            <p className="m-0 mt-0.5 text-sm text-muted md:text-base">
              <span className="hidden md:inline">{trip.operator} · </span>
              {trip.busType === 'Air-conditioned coach' ? 'AC coach' : trip.busType} · {trip.capacity} seats
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="m-0 font-display text-4xl font-extrabold leading-none md:text-[44px]">
              {sold}
              <span className="text-lg text-muted md:text-[22px]">/{trip.capacity}</span>
            </p>
            <p className="m-0 mt-1 hidden text-sm text-muted md:block">seats sold · {freeSeats.length} left</p>
          </div>
        </div>

        <ProgressBar value={(sold / trip.capacity) * 100} size="lg" />

        <div role="img" aria-label={`${sold} of ${trip.capacity} seats sold`} className="grid grid-cols-7 gap-1.5 md:grid-cols-[repeat(13,26px)]">
          {Array.from({ length: trip.capacity }, (_, i) => (
            <div
              key={i}
              className={cx(
                'h-[30px] rounded-md md:h-[26px]',
                freeSeats.includes(i + 1) ? 'box-border border-2 border-line-strong bg-surface' : 'bg-brand',
              )}
            />
          ))}
        </div>

        {/* Phones put Scan first: it is the action agents repeat most at the door. */}
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-3">
          {closed ? (
            <Button size="xl" className="order-2 text-base md:order-none" variant="muted" disabled>
              Sales closed
            </Button>
          ) : (
            <ButtonLink to="/agent/walk-in" size="xl" className="order-2 text-base md:order-none" icon={<Icon name="plus" />}>
              Sell walk-in seat
            </ButtonLink>
          )}
          <ButtonLink to="/agent/scan" variant="dark" size="xl" className="order-1 text-base md:order-none" icon={<Icon name="scan" />}>
            Scan ticket
          </ButtonLink>
          <Button size="xl" className="order-3 text-base md:order-none" variant={departed ? 'muted' : 'outline'} disabled={departed} onClick={onDepart}>
            {departed ? 'Departed' : 'Mark as departed'}
          </Button>
        </div>
        <p className="m-0 text-sm text-muted">
          <span className="md:hidden">{freeSeats.length} seats left · walk-ins take the lowest free number</span>
          <span className="hidden md:inline">
            Walk-in sales take the lowest free seat number and print or SMS a ticket. Online buyers see the change instantly.
          </span>
        </p>
      </div>
    </section>
  )
}
