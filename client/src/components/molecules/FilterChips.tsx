import { cx } from '@/lib/format'

interface FilterChipsProps<T extends string> {
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

/** Row of pill toggles, e.g. All / Loading / Scheduled / Full / Departed. */
export function FilterChips<T extends string>({ label, options, value, onChange }: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-11 shrink-0 cursor-pointer rounded-full border px-3.5 text-sm font-semibold transition-colors',
              on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink hover:border-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
