import { cx } from '@/lib/format'

interface Option<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}

/** Pill toggle, e.g. "All buses / Loading now" and "Mobile money / Card". */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-xl bg-sunken p-1">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-11 flex-1 cursor-pointer whitespace-nowrap rounded-[9px] border-0 px-3.5 font-semibold transition-colors',
              on ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(22,32,28,0.15)]' : 'bg-transparent text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
