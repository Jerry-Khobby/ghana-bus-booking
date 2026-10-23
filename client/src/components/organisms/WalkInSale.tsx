import type { FormEvent } from 'react'
import { ButtonLink, Button, Checkbox, Eyebrow, TextInput } from '@/components/atoms'
import { FormField, SegmentedControl } from '@/components/molecules'
import type { WalkInPayment } from '@/app/StationContext'
import type { Trip } from '@/data/types'
import { cedis, cx } from '@/lib/format'

export const WALK_IN_FORM_ID = 'walk-in-form'

export interface WalkInDraft {
  seat: number
  name: string
  phone: string
  momoPhone: string
  payment: WalkInPayment
  print: boolean
}

interface WalkInFormProps {
  freeSeats: number[]
  fare: number
  draft: WalkInDraft
  onChange: (draft: WalkInDraft) => void
  onSubmit: () => void
}

export function issueLabel(payment: WalkInPayment) {
  return payment === 'cash' ? 'Cash received — issue ticket' : 'Send payment prompt'
}

/** Seat chips, passenger details and payment for a walk-in sale. */
export function WalkInForm({ freeSeats, fare, draft, onChange, onSubmit }: WalkInFormProps) {
  const set = (patch: Partial<WalkInDraft>) => onChange({ ...draft, ...patch })

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit()
  }

  return (
    <form
      id={WALK_IN_FORM_ID}
      aria-label="Walk-in sale"
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-5 rounded-2xl border border-line bg-surface p-4 md:p-[22px] lg:flex-1 lg:gap-[22px] lg:p-6"
    >
      <fieldset className="m-0 border-0 p-0">
        <Eyebrow as="legend" className="pb-2.5">
          Seat · lowest free number is picked for you
        </Eyebrow>
        <div className="flex flex-wrap gap-2">
          {freeSeats.map((n) => {
            const mine = n === draft.seat
            return (
              <button
                key={n}
                type="button"
                aria-pressed={mine}
                aria-label={`Seat ${n}${mine ? ', selected' : ', free'}`}
                onClick={() => set({ seat: n })}
                className={cx(
                  'size-12 cursor-pointer rounded-t-[10px] rounded-b-md border-2 font-mono text-base font-semibold md:size-[52px]',
                  mine ? 'border-brand bg-brand text-white' : 'border-ink bg-surface text-ink hover:bg-brand-tint',
                )}
              >
                {n}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <FormField id="wi-name" label="Passenger name (optional)">
          <TextInput id="wi-name" autoComplete="off" placeholder="e.g. Yaw Mensah" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </FormField>
        <FormField id="wi-phone" label="Phone for SMS ticket (optional)">
          <TextInput id="wi-phone" type="tel" inputMode="tel" placeholder="024 000 0000" className="font-mono" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
        </FormField>
      </div>

      <fieldset className="m-0 border-0 p-0">
        <Eyebrow as="legend" className="pb-2.5">
          Payment
        </Eyebrow>
        <div className="max-w-[420px]">
          <SegmentedControl
            label="Payment method"
            value={draft.payment}
            onChange={(payment) => set({ payment })}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'momo', label: 'Mobile money' },
            ]}
          />
        </div>
      </fieldset>

      {draft.payment === 'momo' ? (
        <div className="max-w-[420px]">
          <FormField id="wi-momo" label="Passenger's mobile money number" hint="The passenger approves the prompt on their phone. The ticket is issued once payment confirms.">
            <TextInput
              id="wi-momo"
              type="tel"
              inputMode="tel"
              required
              placeholder="024 000 0000"
              className="font-mono"
              value={draft.momoPhone}
              onChange={(e) => set({ momoPhone: e.target.value })}
            />
          </FormField>
        </div>
      ) : (
        <p className="m-0 rounded-[10px] bg-held px-3.5 py-3 text-[15px] text-held-ink">
          Collect <strong>{cedis(fare)}</strong> in cash before issuing. Cash sales are listed under your name in the end-of-day report.
        </p>
      )}

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox className="size-5" checked={draft.print} onChange={() => set({ print: !draft.print })} />
        Print a paper ticket as well
      </label>

      {/* On phones and tablets these sit in the sticky bar instead. */}
      <div className="hidden lg:block">
        <WalkInActions payment={draft.payment} />
      </div>
    </form>
  )
}

/** Cancel and issue; issue submits the walk-in form via the `form` attribute. */
export function WalkInActions({ payment }: { payment: WalkInPayment }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ButtonLink to="/agent" variant="outline" size="lg" className="min-h-[54px]">
        Cancel
      </ButtonLink>
      <Button type="submit" form={WALK_IN_FORM_ID} size="lg" className="min-h-[54px]">
        {issueLabel(payment)}
      </Button>
    </div>
  )
}

interface WalkInPreviewProps {
  trip: Trip
  seat: number
  payment: WalkInPayment
  agent: string
  /** `strip` sits above the form on phones and tablets; `card` beside it on desktop. */
  variant: 'strip' | 'card'
}

/** The ticket about to be issued. */
export function WalkInPreview({ trip, seat, payment, agent, variant }: WalkInPreviewProps) {
  const method = payment === 'cash' ? 'Cash' : 'Mobile money'
  const leaves = trip.departsAt ? `departs ${trip.departsAt}` : 'leaves when full'
  if (variant === 'strip') {
    return (
      <section aria-label="Ticket preview" className="flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3.5 text-white md:px-5 md:py-[18px]">
        <div className="min-w-0">
          <p className="m-0 font-display text-lg font-bold md:text-xl">
            {trip.from.city} → {trip.to.city}
          </p>
          <p className="m-0 text-sm text-on-dark">
            {trip.plate} · bay {trip.bay} · {method} · {cedis(trip.fare)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="m-0 text-xs text-on-dark">Seat</p>
          <p className="m-0 font-mono text-[34px] font-semibold leading-none text-gold">{seat}</p>
        </div>
      </section>
    )
  }

  return (
    <aside aria-label="Ticket preview" className="flex w-[320px] shrink-0 flex-col gap-3.5 rounded-2xl bg-ink p-[22px] text-white">
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-on-dark">Ticket to be issued</p>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="m-0 font-display text-[22px] font-bold">
            {trip.from.city} → {trip.to.city}
          </p>
          <p className="m-0 text-sm text-on-dark">
            Bay {trip.bay} · {leaves}
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-xs text-on-dark">Seat</p>
          <p className="m-0 font-mono text-[40px] font-semibold leading-none text-gold">{seat}</p>
        </div>
      </div>
      <div className="h-px bg-ink-line" aria-hidden="true" />
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[15px]">
        <dt className="text-on-dark">Fare</dt>
        <dd className="m-0 text-right">{cedis(trip.fare)}</dd>
        <dt className="text-on-dark">Paid by</dt>
        <dd className="m-0 text-right">{method}</dd>
        <dt className="text-on-dark">Sold by</dt>
        <dd className="m-0 text-right">{agent}</dd>
      </dl>
      <p className="m-0 text-sm text-on-dark">The seat is held while you fill this in, so an online buyer cannot take it.</p>
    </aside>
  )
}
