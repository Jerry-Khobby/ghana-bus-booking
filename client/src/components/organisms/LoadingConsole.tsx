import { Button, ButtonLink, Heading, Icon, ProgressBar } from '@/components/atoms'
import type { Trip } from '@/data/types'
import { cx } from '@/lib/format'

interface LoadingConsoleProps {
  trip: Trip
  sold: number
  departed: boolean
  onSellWalkIn: () => void
  onDepart: () => void
}

/** The bus currently loading at the agent's bay, with walk-in sales and boarding controls. */
export function LoadingConsole({ trip, sold, departed, onSellWalkIn, onDepart }: LoadingConsoleProps) {
  const full = sold >= trip.capacity
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Heading as="h1" size="xl" id="now-h">
              {trip.from.city} → {trip.to.city}
            </Heading>
            <p className="m-0 mt-0.5 text-muted">
              {trip.operator} · {trip.busType === 'Air-conditioned coach' ? 'AC coach' : trip.busType} · {trip.capacity} seats
            </p>
          </div>
          <div className="text-right">
            <p className="m-0 font-display text-[44px] font-extrabold leading-none">
              {sold}
              <span className="text-[22px] text-muted">/{trip.capacity}</span>
            </p>
            <p className="m-0 mt-1 text-sm text-muted">seats sold · {trip.capacity - sold} left</p>
          </div>
        </div>

        <ProgressBar value={(sold / trip.capacity) * 100} size="lg" />

        <div
          role="img"
          aria-label={`${sold} of ${trip.capacity} seats sold`}
          className="grid grid-cols-7 gap-1.5 md:grid-cols-[repeat(13,26px)]"
        >
          {Array.from({ length: trip.capacity }, (_, i) => (
            <div
              key={i}
              className={cx(
                'h-[30px] rounded-md md:h-[26px]',
                i < sold ? 'bg-brand' : 'box-border border-2 border-line-strong bg-surface',
              )}
            />
          ))}
        </div>

        {/* Phones put Scan first: it is the action agents repeat most at the door. */}
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-3">
          <Button
            size="xl"
            className="order-2 text-base md:order-none"
            variant={departed || full ? 'muted' : 'primary'}
            disabled={departed || full}
            onClick={onSellWalkIn}
            icon={<Icon name="plus" />}
          >
            Sell walk-in seat
          </Button>
          <ButtonLink to="/agent/scan" variant="dark" size="xl" className="order-1 text-base md:order-none" icon={<Icon name="scan" />}>
            Scan ticket
          </ButtonLink>
          <Button size="xl" className="order-3 text-base md:order-none" variant={departed ? 'muted' : 'outline'} disabled={departed} onClick={onDepart}>
            Mark as departed
          </Button>
        </div>
        <p className="m-0 text-sm text-muted">
          Walk-in sales take the lowest free seat number and print or SMS a ticket. Online buyers see the change instantly.
        </p>
      </div>
    </section>
  )
}
