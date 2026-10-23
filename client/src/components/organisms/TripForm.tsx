import type { FormEvent } from 'react'
import { Badge, Button, ButtonLink, Checkbox, Dropdown, Eyebrow, Mono, TextInput } from '@/components/atoms'
import { ChoiceCard, FormField } from '@/components/molecules'
import { cedis, cx } from '@/lib/format'

export const TRIP_FORM_ID = 'trip-form'

export type DepartureMode = 'scheduled' | 'fill'

export interface TripDraft {
  routeId: string
  busPlate: string
  mode: DepartureMode
  date: string
  time: string
  startLoading: string
  leaveBy: string
  fare: string
  bay: number
  openOnline: boolean
}

interface TripFormProps {
  draft: TripDraft
  onChange: (draft: TripDraft) => void
  onSubmit: () => void
  routes: Array<{ id: string; name: string; fare: number }>
  buses: Array<{ plate: string; label: string }>
  bays: number[]
  submitLabel: string
}

/** Route, bus, departure, fare and bay for a new or edited trip. */
export function TripForm({ draft, onChange, onSubmit, routes, buses, bays, submitLabel }: TripFormProps) {
  const set = (patch: Partial<TripDraft>) => onChange({ ...draft, ...patch })

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit()
  }

  function pickRoute(routeId: string) {
    // The fare follows the route's base fare until the operator types their own.
    const prev = routes.find((r) => r.id === draft.routeId)
    const next = routes.find((r) => r.id === routeId)
    const untouched = !draft.fare || (prev && Number(draft.fare) === prev.fare)
    set({ routeId, fare: untouched && next ? String(next.fare) : draft.fare })
  }

  return (
    <form
      id={TRIP_FORM_ID}
      aria-label="Trip details"
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-5 rounded-[14px] border border-line bg-surface p-4 md:p-[22px] lg:flex-1"
    >
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <FormField id="nt-route" label="Route">
          <Dropdown id="nt-route" labelledBy="nt-route-label" value={draft.routeId} options={routes.map((r) => ({ value: r.id, label: r.name }))} onChange={pickRoute} />
        </FormField>
        <FormField id="nt-bus" label="Bus">
          <Dropdown id="nt-bus" labelledBy="nt-bus-label" value={draft.busPlate} options={buses.map((b) => ({ value: b.plate, label: b.label }))} onChange={(busPlate) => set({ busPlate })} />
        </FormField>
      </div>

      <fieldset className="m-0 border-0 p-0">
        <Eyebrow as="legend" className="pb-2.5">
          How does it leave?
        </Eyebrow>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <ChoiceCard title="At a fixed time" hint="Passengers book ahead" selected={draft.mode === 'scheduled'} onSelect={() => set({ mode: 'scheduled' })} />
          <ChoiceCard title="When it is full" hint="Loads at the bay, fill and go" selected={draft.mode === 'fill'} onSelect={() => set({ mode: 'fill' })} />
        </div>
      </fieldset>

      {draft.mode === 'scheduled' ? (
        <div className="grid grid-cols-2 gap-3.5">
          <FormField id="nt-date" label="Date">
            <TextInput id="nt-date" type="date" required value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </FormField>
          <FormField id="nt-time" label="Departure time">
            <TextInput id="nt-time" type="time" required value={draft.time} onChange={(e) => set({ time: e.target.value })} />
          </FormField>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5">
          <FormField id="nt-start" label="Start loading at">
            <TextInput id="nt-start" type="time" required value={draft.startLoading} onChange={(e) => set({ startLoading: e.target.value })} />
          </FormField>
          <FormField id="nt-latest" label="Leave by, even if not full">
            <TextInput id="nt-latest" type="time" required value={draft.leaveBy} onChange={(e) => set({ leaveBy: e.target.value })} />
          </FormField>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5">
        <FormField id="nt-fare" label="Fare (GH¢)" hint="Filled from the route's base fare">
          <TextInput id="nt-fare" inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?" value={draft.fare} onChange={(e) => set({ fare: e.target.value })} />
        </FormField>
        <FormField id="nt-bay" label="Boarding bay">
          <Dropdown id="nt-bay" labelledBy="nt-bay-label" value={String(draft.bay)} options={bays.map((b) => ({ value: String(b), label: `Bay ${b}` }))} onChange={(v) => set({ bay: Number(v) })} />
        </FormField>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox className="size-5" checked={draft.openOnline} onChange={() => set({ openOnline: !draft.openOnline })} />
        Open for online booking as soon as it is published
      </label>

      {/* On phones these sit in the sticky bar instead. */}
      <div className="hidden md:block">
        <TripFormActions submitLabel={submitLabel} />
      </div>
    </form>
  )
}

export function TripFormActions({ submitLabel }: { submitLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ButtonLink to="/operator/trips" variant="outline" size="lg">
        Cancel
      </ButtonLink>
      <Button type="submit" form={TRIP_FORM_ID} size="lg">
        {submitLabel}
      </Button>
    </div>
  )
}

interface TripPreviewProps {
  mode: DepartureMode
  when: string
  plate: string
  operator: string
  busType: string
  route: string
  seats: number
  fare: number
  bay: number
}

/** The results card passengers will see once the trip is published. */
export function TripPreview({ mode, when, plate, operator, busType, route, seats, fare, bay }: TripPreviewProps) {
  return (
    <section aria-label="Passenger preview" className="flex w-full flex-col gap-2.5 lg:w-[320px] lg:shrink-0">
      <Eyebrow>Passengers will see</Eyebrow>
      <article className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-[18px]">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={mode === 'scheduled' ? 'scheduled' : 'loading'}>{mode === 'scheduled' ? 'Scheduled' : `Loading · bay ${bay}`}</Badge>
          <Mono className="text-[13px] text-muted">{plate}</Mono>
        </div>
        <h2 className="m-0 font-display text-xl font-bold">{when}</h2>
        <p className="m-0 text-sm text-muted">
          {operator} · {busType} · {route}
        </p>
        <div className="h-2 rounded-full bg-sunken" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <span className="text-sm">
            <strong>{seats} seats left</strong>
          </span>
          <span className={cx('font-display font-bold', !fare && 'text-muted')}>{fare ? cedis(fare) : 'GH¢ —'}</span>
        </div>
      </article>
    </section>
  )
}
