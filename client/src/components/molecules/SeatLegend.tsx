import { Card, Eyebrow, SeatSwatch } from '@/components/atoms'
import type { SeatStatus } from '@/data/types'

const items: Array<{ status: SeatStatus; label: string; short: string }> = [
  { status: 'free', label: 'Free', short: 'Free' },
  { status: 'mine', label: 'Your seats', short: 'Yours' },
  { status: 'held', label: 'Being paid for', short: 'Being paid for' },
  { status: 'taken', label: 'Taken', short: 'Taken' },
]

/** Seat key: a card beside the map, or a single inline row above it on phones. */
export function SeatLegend({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <ul aria-label="Key" className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-2 p-0 text-[13px]">
        {items.map((i) => (
          <li key={i.status} className="flex items-center gap-1.5">
            <SeatSwatch status={i.status} small />
            {i.short}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card padded={false} className="px-[22px] py-[18px]">
      <Eyebrow className="mb-3">Key</Eyebrow>
      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 text-sm">
        {items.map((i) => (
          <li key={i.status} className="flex items-center gap-2.5">
            <SeatSwatch status={i.status} />
            {i.label}
          </li>
        ))}
      </ul>
    </Card>
  )
}
