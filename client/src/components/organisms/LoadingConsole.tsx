import type { ApiConsole } from '@/api/agent'
import { Button, ButtonLink, Heading, Icon, ProgressBar } from '@/components/atoms'
import { bySeat, cx } from '@/lib/format'

const BUS: Record<string, string> = { AC_COACH: 'AC coach', STANDARD: 'Standard bus', MINIBUS: 'Minibus' }

interface LoadingConsoleProps {
  trip: NonNullable<ApiConsole['trip']>
  counts: NonNullable<ApiConsole['counts']>
  seats: ApiConsole['seats']
  operator?: string
  /** An action is being saved. */
  busy?: boolean
  onStartLoading: () => void
  onDepart: () => void
  /** "3 passengers have not boarded. Depart anyway?" waiting for an answer. */
  confirmDepart?: { message: string; onConfirm: () => void; onCancel: () => void } | null
}

const seatClass = (seat: ApiConsole['seats'][number]) =>
  seat.boarded
    ? 'bg-brand-dark'
    : seat.status === 'SOLD'
      ? 'bg-brand'
      : seat.status === 'HELD'
        ? 'box-border border-2 border-dashed border-held-line bg-held'
        : seat.status === 'BLOCKED'
          ? 'bg-taken'
          : 'box-border border-2 border-line-strong bg-surface'

/** The bus at the agent's bay, with walk-in sales and boarding controls. */
export function LoadingConsole({ trip, counts, seats, operator, busy, onStartLoading, onDepart, confirmDepart }: LoadingConsoleProps) {
  const loading = trip.status === 'LOADING'
  const full = trip.status === 'FULL'
  const scheduled = trip.status === 'SCHEDULED'
  const banner = full
    ? 'bg-ink text-white'
    : loading
      ? trip.departDue
        ? 'bg-danger text-white'
        : 'bg-gold text-gold-ink'
      : 'bg-sunken text-ink'
  const sorted = [...seats].sort((a, b) => bySeat(a.label, b.label))

  return (
    <section aria-labelledby="now-h" className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className={cx('flex items-center justify-between gap-3 px-4 py-3 sm:px-6', banner)}>
        <span className="font-bold" aria-live="polite">
          {trip.banner}
          {trip.departDue && ' · time to go'}
        </span>
        <span className="font-mono font-semibold">{trip.bus.plate}</span>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex items-end justify-between gap-2.5 md:flex-wrap md:gap-4">
          <div className="min-w-0">
            <Heading as="h1" size="xl" id="now-h" className="text-2xl md:text-[30px] lg:text-[34px]">
              {trip.route.origin.city} → {trip.route.destination.city}
            </Heading>
            <p className="m-0 mt-0.5 text-sm text-muted md:text-base">
              {operator && <span className="hidden md:inline">{operator} · </span>}
              {BUS[trip.bus.type] ?? trip.bus.type} · {counts.total} seats
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="m-0 font-display text-4xl font-extrabold leading-none md:text-[44px]">
              {counts.sold}
              <span className="text-lg text-muted md:text-[22px]">/{counts.total}</span>
            </p>
            <p className="m-0 mt-1 hidden text-sm text-muted md:block">
              seats sold · {counts.free} left{counts.held ? ` · ${counts.held} being paid for` : ''}
            </p>
          </div>
        </div>

        <ProgressBar value={counts.total ? (counts.sold / counts.total) * 100 : 0} size="lg" />

        <div role="img" aria-label={`${counts.sold} of ${counts.total} seats sold, ${counts.boarded} boarded`} className="grid grid-cols-7 gap-1.5 md:grid-cols-[repeat(13,26px)]">
          {sorted.map((seat) => (
            <div key={seat.label} title={`Seat ${seat.label}`} className={cx('h-[30px] rounded-md md:h-[26px]', seatClass(seat))} />
          ))}
        </div>
        <p className="m-0 -mt-2 text-xs text-muted">
          Dark green: boarded · green: sold · dashed: being paid for · outline: free
        </p>

        {confirmDepart ? (
          <div role="alertdialog" aria-labelledby="dep-h" className="flex flex-col gap-3 rounded-xl border-2 border-danger p-4">
            <p id="dep-h" className="m-0 font-semibold">
              {confirmDepart.message}
            </p>
            <p className="m-0 text-sm text-muted">Their tickets will be marked as not used.</p>
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="outline" onClick={confirmDepart.onCancel} disabled={busy}>
                Keep loading
              </Button>
              <Button onClick={confirmDepart.onConfirm} disabled={busy}>
                Depart anyway
              </Button>
            </div>
          </div>
        ) : (
          /* Phones put Scan first: it is the action agents repeat most at the door. */
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-3">
            {scheduled ? (
              <Button size="xl" className="order-2 text-base md:order-none" onClick={onStartLoading} disabled={busy}>
                Start loading
              </Button>
            ) : loading && counts.free > 0 ? (
              <ButtonLink to="/agent/walk-in" size="xl" className="order-2 text-base md:order-none" icon={<Icon name="plus" />}>
                Sell walk-in seat
              </ButtonLink>
            ) : (
              <Button size="xl" className="order-2 text-base md:order-none" variant="muted" disabled>
                Sales closed
              </Button>
            )}
            <ButtonLink to="/agent/scan" variant="dark" size="xl" className="order-1 text-base md:order-none" icon={<Icon name="scan" />}>
              Scan ticket
            </ButtonLink>
            <Button
              size="xl"
              className="order-3 text-base md:order-none"
              variant={loading || full ? 'outline' : 'muted'}
              disabled={busy || !(loading || full)}
              onClick={onDepart}
            >
              Mark as departed
            </Button>
          </div>
        )}
        <p className="m-0 text-sm text-muted">
          <span className="md:hidden">{counts.free} seats left · walk-ins take the lowest free number</span>
          <span className="hidden md:inline">
            Walk-in sales take the lowest free seat number unless you pick one. Online buyers see the change instantly.
          </span>
        </p>
      </div>
    </section>
  )
}
