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
  /** Fewer, merged columns for tablet widths, as in the tablet designs. Defaults to `columns`. */
  tabletColumns?: Column<T>[]
  /** How one row looks as a card. */
  card: (row: T) => ReactNode
  /** Width below which rows become cards: phones only (`md`) or phones and tablets (`lg`). */
  cardsBelow?: 'md' | 'lg'
  minWidth?: number
  /** Heading row above the table, or above the cards. */
  header?: ReactNode
  /** Line under the table, e.g. "7 trips shown". */
  footer?: ReactNode
  empty?: ReactNode
}

function Table<T>({ rows, rowKey, columns, minWidth }: { rows: T[]; rowKey: (row: T) => string; columns: Column<T>[]; minWidth?: number }) {
  return (
    // `relative` keeps absolutely positioned screen-reader labels inside the scroll box.
    <div className="relative overflow-x-auto">
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
  )
}

/**
 * A white table card on wide screens; a stack of cards on narrow ones, as in the phone designs.
 * Tablets get their own condensed columns when `tabletColumns` is given.
 */
export function ResponsiveTable<T>({
  label,
  rows,
  rowKey,
  columns,
  tabletColumns,
  card,
  cardsBelow = 'md',
  minWidth = 680,
  header,
  footer,
  empty,
}: ResponsiveTableProps<T>) {
  const tableFrom = cardsBelow === 'lg' ? 'hidden lg:block' : 'hidden md:block'
  const cardsUntil = cardsBelow === 'lg' ? 'lg:hidden' : 'md:hidden'
  const splitTablet = cardsBelow === 'md' && tabletColumns

  return (
    <section aria-label={label}>
      <div className={cx(tableFrom, 'rounded-[14px] border border-line bg-surface px-4 pb-3 pt-1.5 lg:px-5 lg:pt-2')}>
        {header && <div className="pb-1 pt-3">{header}</div>}
        {splitTablet ? (
          <>
            <div className="lg:hidden">
              <Table rows={rows} rowKey={rowKey} columns={tabletColumns} />
            </div>
            <div className="hidden lg:block">
              <Table rows={rows} rowKey={rowKey} columns={columns} minWidth={minWidth} />
            </div>
          </>
        ) : (
          <Table rows={rows} rowKey={rowKey} columns={columns} minWidth={minWidth} />
        )}
        {rows.length === 0 && empty}
        {footer && <div className="mt-3 text-sm text-muted">{footer}</div>}
      </div>

      <div className={cx('flex flex-col gap-2.5', cardsUntil)}>
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

/** Two-line table cell: a bold first line and a small muted second line. */
export function StackedCell({ title, detail, mono }: { title: ReactNode; detail: ReactNode; mono?: boolean }) {
  return (
    <>
      <p className={cx('m-0 font-semibold', mono && 'font-mono')}>{title}</p>
      <p className="m-0 text-[13px] text-muted">{detail}</p>
    </>
  )
}
