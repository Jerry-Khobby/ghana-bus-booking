import { useId } from 'react'

interface NumberStepperProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** Noun for the button labels, e.g. "rows" gives "Fewer rows" / "More rows". */
  noun: string
}

export function NumberStepper({ label, value, min, max, onChange, noun }: NumberStepperProps) {
  const id = useId()
  const btn =
    'size-12 cursor-pointer rounded-[10px] border border-line-strong bg-surface text-[22px] text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div className="flex flex-col gap-2.5">
      <span id={id} className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${noun}`} className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <span aria-live="polite" className="min-w-10 text-center font-mono text-[22px] font-semibold">
          {value}
        </span>
        <button type="button" aria-label={`More ${noun}`} className={btn} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  )
}
