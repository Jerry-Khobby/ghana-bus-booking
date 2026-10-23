import { cx } from '@/lib/format'

interface StatTileProps {
  label: string
  value: string
  note?: string
  danger?: boolean
}

export function StatTile({ label, value, note, danger }: StatTileProps) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-3.5 sm:p-[18px]">
      <p className="m-0 text-[13px] text-muted sm:text-sm">{label}</p>
      <p className={cx('m-0 mt-1 font-display text-2xl font-extrabold sm:text-[32px]', danger && 'text-danger')}>
        {value}
      </p>
      {note && <p className="m-0 hidden text-[13px] text-muted sm:block">{note}</p>}
    </div>
  )
}
