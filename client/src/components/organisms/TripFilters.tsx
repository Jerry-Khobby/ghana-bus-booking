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

const longType: Record<string, string> = {
  'Air-conditioned coach': 'AC coach',
  'Standard bus': 'standard',
  Minibus: 'minibus',
}

/** Summary chips for the folded filters: "AC + standard" on phones, "AC coach + standard" on tablets. */
function chips(props: TripFiltersProps, names: Record<string, string>): string[] {
  const types =
    props.selectedBusTypes.length === props.busTypes.length
      ? 'All bus types'
      : props.selectedBusTypes.length === 0
        ? 'No bus types'
        : props.selectedBusTypes.map((t) => names[t] ?? t).join(' + ')
  const ops =
    props.selectedOperators.length === props.operators.length
      ? 'All operators'
      : `${props.selectedOperators.length} of ${props.operators.length} operators`
  return [types.charAt(0).toUpperCase() + types.slice(1), ops]
}

function Chip({ children }: { children: string }) {
  return <span className="flex-none rounded-full bg-brand-tint px-3 py-2 text-sm font-semibold text-brand-ink md:py-1.5">{children}</span>
}

export function TripFilters(props: TripFiltersProps) {
  const [open, setOpen] = useState(false)

  const groups = (
    <>
      <CheckboxGroup legend="Bus type" options={props.busTypes} checked={props.selectedBusTypes} onToggle={props.onToggleBusType} />
      <CheckboxGroup legend="Operator" options={props.operators} checked={props.selectedOperators} onToggle={props.onToggleOperator} />
    </>
  )

  // Narrowed filter groups, shown on the tablet Filters button as "Filters · 2".
  const active = props.selectedBusTypes.length

  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-controls="trip-filters-panel"
      className="flex min-h-11 flex-none cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink hover:border-ink md:min-h-[52px] md:gap-2 md:rounded-xl md:px-4 md:text-base"
    >
      <Icon name="filters" size={16} />
      <span className="md:hidden">Filters</span>
      <span className="hidden md:inline">Filters · {active}</span>
      <Icon name="chevronDown" size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
    </button>
  )

  return (
    <aside aria-label="Filters" className="flex w-full flex-col gap-3 md:gap-3.5 lg:w-60 lg:shrink-0 lg:gap-6">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <SegmentedControl
            label="Show"
            value={props.show}
            onChange={props.onShowChange}
            options={[
              { value: 'all', label: 'All buses' },
              { value: 'loading', label: 'Loading now' },
            ]}
          />
        </div>
        {/* Tablets: the Filters button sits beside the toggle. */}
        <div className="hidden md:block lg:hidden">{toggle}</div>
      </div>

      {/* Phones: Filters pill and chips share a row. */}
      <div className="flex items-center gap-2 md:hidden">
        {toggle}
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {chips(props, shortType).map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
      </div>

      {/* Tablets: chips on their own row under the toggle. */}
      <div aria-label="Active filters" className="hidden flex-wrap gap-2 md:flex lg:hidden">
        {chips(props, longType).map((c) => (
          <Chip key={c}>{c}</Chip>
        ))}
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
