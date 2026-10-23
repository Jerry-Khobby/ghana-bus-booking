import { Icon, SeatButton } from '@/components/atoms'
import type { SeatStatus } from '@/data/types'
import { buildRows, defaultLayout, type SeatLayout } from '@/lib/seats'

interface SeatMapProps {
  statuses: Map<number, Exclude<SeatStatus, 'mine'>>
  /** Seats the passenger has picked. */
  selected: number[]
  onPick: (seat: number) => void
  layout?: SeatLayout
}

/** Top-down bus with the driver and door at the front. */
export function SeatMap({ statuses, selected, onPick, layout = defaultLayout }: SeatMapProps) {
  const { rows, back } = buildRows(layout)
  const statusOf = (n: number): SeatStatus => (selected.includes(n) ? 'mine' : (statuses.get(n) ?? 'taken'))

  return (
    <section
      aria-label="Seat map"
      className="flex min-w-0 justify-center overflow-x-auto rounded-2xl border border-line bg-surface px-2 py-4 sm:px-4 md:py-5 lg:py-7"
    >
      <div className="flex w-[280px] flex-col gap-2.5 rounded-b-[18px] rounded-t-[40px] border-[3px] border-ink px-[14px] pb-6 pt-5 sm:w-[300px] sm:px-[18px]">
        <div className="mb-1 flex items-center justify-between border-b-2 border-dashed border-line-strong pb-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Icon name="wheel" size={26} strokeWidth={2} className="text-ink" />
            Driver
          </div>
          <div className="rounded-md border-2 border-ink px-2.5 py-1 text-xs font-semibold">Door</div>
        </div>

        {rows.map((row, i) => (
          <div key={i} className="flex justify-between">
            <div className="flex gap-2">
              {row.left.map((n) => (
                <SeatButton key={n} number={n} status={statusOf(n)} onPick={onPick} />
              ))}
            </div>
            <div className="flex gap-2">
              {row.right.map((n) => (
                <SeatButton key={n} number={n} status={statusOf(n)} onPick={onPick} />
              ))}
            </div>
          </div>
        ))}

        {back.length > 0 && (
          <div className="flex justify-between pt-1.5">
            {back.map((n) => (
              <SeatButton key={n} number={n} status={statusOf(n)} onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
