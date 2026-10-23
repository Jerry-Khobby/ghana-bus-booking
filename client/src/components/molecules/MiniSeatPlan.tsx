import type { SeatLayout } from '@/data/types'
import { buildRows } from '@/lib/seats'

/** Thumbnail of a seat plan: one dark square per seat, a gap for the aisle. */
export function MiniSeatPlan({ layout }: { layout: SeatLayout }) {
  const { rows, back, total } = buildRows(layout)
  const cols = layout.left + 1 + layout.right
  const cells: Array<'seat' | 'aisle'> = []
  rows.forEach((r) => {
    r.left.forEach(() => cells.push('seat'))
    cells.push('aisle')
    r.right.forEach(() => cells.push('seat'))
  })
  back.forEach(() => cells.push('seat'))

  return (
    <div className="flex justify-center rounded-xl bg-canvas py-4">
      <div
        role="img"
        aria-label={`Seat plan with ${total} seats`}
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, 12px)` }}
      >
        {cells.map((c, i) => (
          <div key={i} className={c === 'seat' ? 'size-3 rounded-[3px] bg-ink' : 'size-3'} />
        ))}
      </div>
    </div>
  )
}
