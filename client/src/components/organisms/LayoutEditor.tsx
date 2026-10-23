import { Button, ButtonLink, Checkbox, Eyebrow, TextInput } from '@/components/atoms'
import { FormField, NumberStepper, OptionTile } from '@/components/molecules'
import { buildRows, type SeatLayout } from '@/lib/seats'

interface LayoutSettingsProps {
  name: string
  onNameChange: (name: string) => void
  layout: SeatLayout
  onChange: (layout: SeatLayout) => void
  onSave: () => void
}

export function LayoutSettings({ name, onNameChange, layout, onChange, onSave }: LayoutSettingsProps) {
  const { total } = buildRows(layout)
  return (
    <form
      id={LAYOUT_FORM_ID}
      aria-label="Layout settings"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
      className="flex w-full min-w-0 flex-col gap-4 rounded-[14px] border border-line bg-surface p-3.5 md:flex-1 md:gap-5 md:p-[18px] lg:w-[340px] lg:flex-none lg:gap-[22px] lg:p-[22px]"
    >
      <FormField id="lname" label="Layout name">
        <TextInput id="lname" required value={name} onChange={(e) => onNameChange(e.target.value)} />
      </FormField>

      <fieldset className="m-0 border-0 p-0">
        <Eyebrow as="legend" className="pb-2.5">
          Seats per row
        </Eyebrow>
        <div className="grid grid-cols-3 gap-2.5">
          {[1, 2, 3].map((right) => (
            <OptionTile key={right} size="md" selected={layout.right === right} onSelect={() => onChange({ ...layout, right })}>
              {layout.left} + {right}
            </OptionTile>
          ))}
        </div>
      </fieldset>

      <NumberStepper label="Rows" noun="rows" value={layout.rows} min={4} max={16} onChange={(rows) => onChange({ ...layout, rows })} />

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox className="size-5" checked={layout.backRow} onChange={() => onChange({ ...layout, backRow: !layout.backRow })} />
        Full-width back row (one extra seat over the aisle)
      </label>

      <div className="hidden items-center justify-between rounded-xl bg-ink p-4 text-white md:flex">
        <span>Total seats</span>
        <span className="font-display text-[30px] font-extrabold" aria-live="polite">
          {total}
        </span>
      </div>

      {/* On phones these live in the sticky bar (LayoutActions). */}
      <div className="hidden md:block">
        <LayoutActions />
      </div>
      <p className="m-0 text-sm text-muted">Saving creates a new version. Trips already on sale keep the layout they were sold with.</p>
    </form>
  )
}

export const LAYOUT_FORM_ID = 'layout-form'

/** Cancel and Save; Save submits the settings form via the `form` attribute. */
export function LayoutActions() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <ButtonLink to="/operator/layouts" variant="outline" className="min-h-[52px] md:min-h-12">
        Cancel
      </ButtonLink>
      <Button type="submit" form={LAYOUT_FORM_ID} className="min-h-[52px] md:min-h-12">
        Save layout
      </Button>
    </div>
  )
}

const seat =
  'flex size-[30px] sm:size-[34px] box-border items-center justify-center rounded-t-lg rounded-b-[5px] border-2 border-ink font-mono text-[11px] sm:text-xs font-semibold'

export function LayoutPreview({ layout }: { layout: SeatLayout }) {
  const { rows, back } = buildRows(layout)
  return (
    <section
      aria-label="Layout preview"
      className="flex min-w-0 flex-col items-center gap-3.5 overflow-x-auto rounded-[14px] border border-line bg-surface p-3.5 md:w-[320px] md:shrink-0 md:p-4 lg:w-auto lg:flex-1 lg:p-6"
    >
      <Eyebrow className="hidden self-start lg:block">Preview · seats are numbered front to back, left to right</Eyebrow>
      <p className="m-0 flex justify-between self-stretch text-[13px] font-semibold uppercase tracking-[0.06em] text-muted lg:hidden">
        <span>Preview</span>
        <span>{buildRows(layout).total} seats</span>
      </p>
      <div className="flex flex-col gap-2 rounded-b-2xl rounded-t-[34px] border-[3px] border-ink px-4 pb-5 pt-[18px]">
        <div className="mb-1 flex justify-between border-b-2 border-dashed border-line-strong pb-2.5 text-xs font-semibold text-muted">
          <span>Driver</span>
          <span className="rounded-md border-2 border-ink px-2 py-0.5 text-ink">Door</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-1.5">
            {r.left.map((n) => (
              <div key={n} className={seat}>{n}</div>
            ))}
            <div className="size-[30px] sm:size-[34px]" aria-hidden="true" />
            {r.right.map((n) => (
              <div key={n} className={seat}>{n}</div>
            ))}
          </div>
        ))}
        {back.length > 0 && (
          <div className="flex gap-1.5">
            {back.map((n) => (
              <div key={n} className={seat}>{n}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
