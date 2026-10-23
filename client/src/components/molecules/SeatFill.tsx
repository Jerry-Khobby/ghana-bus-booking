import { ProgressBar } from '@/components/atoms'
import { seatsLeftLabel } from '@/lib/format'

interface SeatFillProps {
  capacity: number
  seatsLeft: number
  inactive?: boolean
  /** Right-hand caption, e.g. "Leaves when full". */
  note?: string
}

/** Progress bar of seats sold with the "8 seats left of 49" caption. */
export function SeatFill({ capacity, seatsLeft, inactive, note }: SeatFillProps) {
  const sold = Math.round(((capacity - seatsLeft) / capacity) * 100)
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar value={sold} tone={inactive ? 'inactive' : 'brand'} />
      <div className="flex justify-between gap-3 text-sm text-muted">
        <span>
          <strong className="text-ink">{seatsLeftLabel(seatsLeft)}</strong> of {capacity}
        </span>
        {note && <span>{note}</span>}
      </div>
    </div>
  )
}
