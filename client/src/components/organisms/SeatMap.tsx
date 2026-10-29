import { Icon, SeatButton } from '@/components/atoms'
import type { SeatStatus } from '@/data/types'

/** One square of the bus, as the API lays it out (row r, column c). */
export interface SeatMapCell {
  r: number
  c: number
  type: 'SEAT' | 'AISLE' | 'DRIVER' | 'DOOR' | 'EMPTY'
  label?: string
  status?: SeatStatus
}

interface SeatMapProps {
  rows: number
  cols: number
  cells: SeatMapCell[]
  /** Seat labels the passenger has picked or holds. */
  selected: string[]
  onPick: (label: string) => void
  /** While a pick is being saved, the map can't be tapped. */
  busy?: boolean
}

/** Top-down bus drawn from the trip's layout grid, the front at the top. */
export function SeatMap({ rows, cols, cells, selected, onPick, busy }: SeatMapProps) {
  const at = new Map(cells.map((cell) => [`${cell.r}:${cell.c}`, cell]))
  const statusOf = (cell: SeatMapCell): SeatStatus =>
    cell.label && selected.includes(cell.label) ? 'mine' : (cell.status ?? 'taken')

  return (
    <section
      aria-label="Seat map"
      aria-busy={busy || undefined}
      className="flex min-w-0 justify-center overflow-x-auto rounded-2xl border border-line bg-surface px-2 py-4 sm:px-4 md:py-5 lg:py-7"
    >
      <div
        className="grid w-max gap-2 rounded-b-[18px] rounded-t-[40px] border-[3px] border-ink px-[14px] pb-6 pt-5 sm:px-[18px]"
        style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols)
          const c = i % cols
          const cell = at.get(`${r}:${c}`)
          const key = `${r}:${c}`
          switch (cell?.type) {
            case 'SEAT':
              return (
                <div key={key} className={busy ? 'pointer-events-none' : undefined}>
                  <SeatButton label={cell.label ?? '?'} status={statusOf(cell)} onPick={onPick} />
                </div>
              )
            case 'DRIVER':
              return (
                <div key={key} className="flex size-10 flex-col items-center justify-center text-[10px] font-semibold text-muted sm:size-11">
                  <Icon name="wheel" size={24} strokeWidth={2} className="text-ink" />
                  Driver
                </div>
              )
            case 'DOOR':
              return (
                <div key={key} className="flex size-10 items-center justify-center sm:size-11">
                  <span className="rounded-md border-2 border-ink px-1.5 py-0.5 text-[11px] font-semibold">Door</span>
                </div>
              )
            default:
              // Aisle or empty floor
              return <div key={key} aria-hidden="true" className="size-10 sm:size-11" />
          }
        })}
      </div>
    </section>
  )
}
