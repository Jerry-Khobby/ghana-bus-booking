import type { SeatStatus } from '@/data/types'
import { cx } from '@/lib/format'

const styles: Record<SeatStatus, string> = {
  free: 'bg-surface border-2 border-ink text-ink cursor-pointer hover:bg-brand-tint',
  mine: 'bg-brand border-2 border-brand text-white cursor-pointer',
  held: 'bg-held border-2 border-dashed border-held-line text-held-ink cursor-not-allowed',
  taken: 'bg-taken border-2 border-taken text-taken-ink cursor-not-allowed',
}

const words: Record<SeatStatus, string> = {
  free: 'free',
  mine: 'your seat',
  held: 'being paid for',
  taken: 'taken',
}

interface SeatButtonProps {
  /** The seat's label, e.g. "14". */
  label: string
  status: SeatStatus
  onPick?: (label: string) => void
}

export function SeatButton({ label, status, onPick }: SeatButtonProps) {
  const selectable = status === 'free' || status === 'mine'
  return (
    <button
      type="button"
      disabled={!selectable}
      aria-pressed={status === 'mine'}
      aria-label={`Seat ${label}, ${words[status]}`}
      onClick={() => selectable && onPick?.(label)}
      className={cx(
        'size-10 rounded-t-[10px] rounded-b-md font-mono text-sm font-semibold transition-colors sm:size-11',
        styles[status],
      )}
    >
      {label}
    </button>
  )
}

/** Square swatch matching a seat state, for legends. */
export function SeatSwatch({ status, small }: { status: SeatStatus; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'box-border shrink-0',
        small ? 'size-4 rounded' : 'size-[22px] rounded-md',
        status === 'free' && 'border-2 border-ink bg-surface',
        status === 'mine' && 'bg-brand',
        status === 'held' && 'border-2 border-dashed border-held-line bg-held',
        status === 'taken' && 'bg-taken',
      )}
    />
  )
}
