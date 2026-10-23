import { useState } from 'react'
import { Button, Icon } from '@/components/atoms'
import { CheckboxGroup, InfoNote, SegmentedControl } from '@/components/molecules'

export type ShowFilter = 'all' | 'loading'

interface TripFiltersProps {
  show: ShowFilter
  onShowChange: (v: ShowFilter) => void
  busTypes: readonly string[]
  selectedBusTypes: string[]
  onToggleBusType: (t: string) => void
  operators: readonly string[]
  selectedOperators: string[]
  onToggleOperator: (o: string) => void
}

const shortType: Record<string, string> = {
  'Air-conditioned coach': 'AC',
  'Standard bus': 'standard',
  Minibus: 'minibus',
}

/** Summary chips shown next to the Filters button on phones, e.g. "AC + standard". */
function chips(props: TripFiltersProps): string[] {
  const types = props.selectedBusTypes.length === props.busTypes.length
    ? 'All bus types'
    : props.selectedBusTypes.length === 0
      ? 'No bus types'
      : props.selectedBusTypes.map((t) => shortType[t] ?? t).join(' + ')
  const ops = props.selectedOperators.length === props.operators.length
    ? 'All operators'
    : `${props.selectedOperators.length} of ${props.operators.length} operators`
  return [types.charAt(0).toUpperCase() + types.slice(1), ops]
}

export function TripFilters(props: TripFiltersProps) {
  const [open, setOpen] = useState(false)

  const groups = (
    <>
      <CheckboxGroup legend="Bus type" options={props.busTypes} checked={props.selectedBusTypes} onToggle={props.onToggleBusType} />
      <CheckboxGroup legend="Operator" options={props.operators} checked={props.selectedOperators} onToggle={props.onToggleOperator} />
    </>
  )

  return (
    <aside aria-label="Filters" className="flex w-full flex-col gap-3 lg:w-60 lg:shrink-0 lg:gap-6">
      <SegmentedControl
        label="Show"
        value={props.show}
        onChange={props.onShowChange}
        options={[
          { value: 'all', label: 'All buses' },
          { value: 'loading', label: 'Loading now' },
        ]}
      />

      {/* Phones and tablets: filters fold away behind a pill. */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="trip-filters-panel"
          className="flex min-h-11 flex-none cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink hover:border-ink"
        >
          <Icon name="filters" size={16} />
          Filters
          <Icon name="chevronDown" size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {chips(props).map((c) => (
            <span key={c} className="flex-none rounded-full bg-brand-tint px-3 py-2 text-sm font-semibold text-brand-ink">
              {c}
            </span>
          ))}
        </div>
      </div>

      {open && (
        <section
          id="trip-filters-panel"
          aria-label="Filter options"
          className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 lg:hidden"
        >
          <div className="grid gap-4 sm:grid-cols-2">{groups}</div>
          <Button variant="dark" className="rounded-[10px]" onClick={() => setOpen(false)}>
            Show results
          </Button>
        </section>
      )}

      {/* Desktop: always visible in the sidebar. */}
      <div className="hidden flex-col gap-6 lg:flex">
        {groups}
        <InfoNote>Seat counts update live. A seat you pick is held for you for 5 minutes.</InfoNote>
      </div>
    </aside>
  )
}
