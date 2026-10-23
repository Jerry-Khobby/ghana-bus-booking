import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

interface OptionTileProps {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  size?: 'md' | 'lg'
}

/** Toggle tile used for mobile money networks and seat layout choices. */
export function OptionTile({ selected, onSelect, children, size = 'lg' }: OptionTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cx(
        'cursor-pointer rounded-[10px] font-semibold transition-colors',
        size === 'lg' ? 'min-h-[52px]' : 'min-h-12',
        selected
          ? 'border-2 border-brand bg-brand-tint text-brand-ink'
          : 'border border-line-strong bg-surface text-ink hover:border-ink',
      )}
    >
      {children}
    </button>
  )
}
