import { cx } from '@/lib/format'

const steps = ['Bus', 'Seat', 'Pay', 'Ticket'] as const

export type BookingStep = (typeof steps)[number]

/** The "1 Bus · 2 Seat · 3 Pay · 4 Ticket" pills in the booking header. */
export function StepIndicator({ current }: { current: BookingStep }) {
  const currentIndex = steps.indexOf(current)
  return (
    <ol aria-label="Booking steps" className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm">
      {steps.map((step, i) => (
        <li
          key={step}
          aria-current={i === currentIndex ? 'step' : undefined}
          className={cx(
            'rounded-full px-3 py-1.5 font-semibold',
            i < currentIndex && 'bg-brand-tint text-brand-ink',
            i === currentIndex && 'bg-ink text-white',
            i > currentIndex && 'bg-sunken text-muted',
          )}
        >
          {i + 1} {step}
        </li>
      ))}
    </ol>
  )
}
