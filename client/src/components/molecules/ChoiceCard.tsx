import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

interface ChoiceCardProps {
  title: string
  hint: ReactNode
  selected: boolean
  onSelect: () => void
}

/** Two-line option tile, e.g. "At a fixed time · Passengers book ahead". */
export function ChoiceCard({ title, hint, selected, onSelect }: ChoiceCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cx(
        'min-h-[72px] cursor-pointer rounded-xl px-4 py-3 text-left text-ink transition-colors',
        selected ? 'border-2 border-brand bg-brand-tint' : 'border border-line-strong bg-surface hover:border-ink',
      )}
    >
      <span className="block font-semibold">{title}</span>
      <span className="block text-sm text-muted">{hint}</span>
    </button>
  )
}
