import type { ReactNode } from 'react'
import { Th, Td } from '@/components/atoms'
import { cx } from '@/lib/format'

export interface Column<T> {
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Extra classes for this column's cells, e.g. "text-right font-mono". */
  className?: string
}

interface ResponsiveTableProps<T> {
  /** Accessible name of the list, e.g. "Trips". */
  label: string
  rows: T[]
  rowKey: (row: T) => string
  columns: Column<T>[]
  /** How one row looks as a card on phones. */
  card: (row: T) => ReactNode
  minWidth?: number
  /** Heading row above the table on tablet and desktop. */
  header?: ReactNode
  /** Line under the table, e.g. "7 trips shown". */
  footer?: ReactNode
  empty?: ReactNode
}

/**
 * A white table card from tablet up; a stack of cards on phones, as in the phone designs.
 */
export function ResponsiveTable<T>({ label, rows, rowKey, columns, card, minWidth = 680, header, footer, empty }: ResponsiveTableProps<T>) {
  return (
    <section aria-label={label}>
      <div className="hidden rounded-[14px] border border-line bg-surface px-5 pb-3 pt-2 md:block">
        {header && <div className="pb-1 pt-3">{header}</div>}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px]" style={{ minWidth }}>
            <thead>
              <tr className="text-left">
                {columns.map((c, i) => (
                  <Th key={i} className={c.className?.includes('text-right') ? 'text-right' : undefined}>
                    {c.header}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={rowKey(r)}>
                  {columns.map((c, i) => (
                    <Td key={i} className={c.className}>
                      {c.cell(r)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && empty}
        {footer && <div className="mt-3 text-sm text-muted">{footer}</div>}
      </div>

      <div className="flex flex-col gap-2.5 md:hidden">
        {header}
        {rows.map((r) => (
          <div key={rowKey(r)}>{card(r)}</div>
        ))}
        {rows.length === 0 && empty}
        {footer && <div className="text-sm text-muted">{footer}</div>}
      </div>
    </section>
  )
}

/** White card used for one row on phones. */
export function RowCard({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={cx('flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-3.5 py-3', className)}>{children}</article>
}
