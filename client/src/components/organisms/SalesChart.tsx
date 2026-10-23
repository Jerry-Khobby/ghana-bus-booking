import { useState } from 'react'
import { Heading } from '@/components/atoms'
import type { DailySales } from '@/data/operator'
import { cx } from '@/lib/format'

interface SalesChartProps {
  days: DailySales[]
  /** Period caption next to the title, e.g. "Last 7 days". */
  caption: string
}

function dayLabel(iso: string, long = false) {
  return new Date(`${iso}T12:00`).toLocaleDateString('en-GB', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short' })
}

/**
 * Stacked bars of tickets per day: online (green) at the base, walk-in (gold) on top.
 * Hover or focus a day for its numbers; "Show as table" gives the same data as text.
 */
export function SalesChart({ days, caption }: SalesChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(...days.map((d) => d.online + d.walkIn))
  // Round the axis top up to a tidy number so the gridline labels read cleanly.
  const top = Math.ceil(max / 50) * 50
  const many = days.length > 10

  return (
    <section aria-labelledby="rp-chart-h" className="rounded-[14px] border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Heading as="h2" size="sm" id="rp-chart-h" className="text-lg md:text-[19px]">
            Tickets sold per day
          </Heading>
          <p className="m-0 text-[13px] text-muted">{caption}</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-3 rounded-[3px] bg-brand" />
            Online
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-3 rounded-[3px] bg-chart-gold" />
            Walk-in
          </span>
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => setAsTable((t) => !t)}
            className="min-h-11 cursor-pointer border-0 bg-transparent px-1 font-semibold text-brand underline-offset-4 hover:underline"
          >
            {asTable ? 'Show chart' : 'Show as table'}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[13px] uppercase tracking-[0.05em] text-muted">
                <th scope="col" className="border-b border-line p-2">Day</th>
                <th scope="col" className="border-b border-line p-2 text-right">Online</th>
                <th scope="col" className="border-b border-line p-2 text-right">Walk-in</th>
                <th scope="col" className="border-b border-line p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td className="border-b border-sunken p-2">{dayLabel(d.date, true)}</td>
                  <td className="border-b border-sunken p-2 text-right font-mono">{d.online}</td>
                  <td className="border-b border-sunken p-2 text-right font-mono">{d.walkIn}</td>
                  <td className="border-b border-sunken p-2 text-right font-mono font-semibold">{d.online + d.walkIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="relative mt-4 h-[200px]">
            {/* Recessive gridlines at half and full scale. */}
            {[0.5, 1].map((f) => (
              <div key={f} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-sunken" style={{ bottom: `${f * 100}%` }}>
                <span className="absolute -top-2.5 right-0 bg-surface pl-1 text-[11px] text-muted">{Math.round(top * f)}</span>
              </div>
            ))}
            <div
              role="list"
              aria-label="Tickets sold per day, online and walk-in"
              className={cx('relative flex h-full items-end border-b border-line-strong px-1', many ? 'gap-[3px]' : 'gap-2.5 md:gap-3.5')}
            >
              {days.map((d, i) => {
                const total = d.online + d.walkIn
                const on = active === i
                return (
                  <div
                    key={d.date}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${dayLabel(d.date, true)}: ${total} tickets, ${d.online} online and ${d.walkIn} walk-in`}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="relative flex h-full flex-1 cursor-default flex-col justify-end outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    {/* Hit area is the whole column; the marks sit at its foot. */}
                    <div
                      className={cx('mx-auto flex w-full flex-col gap-[2px] transition-opacity', !many && 'max-w-11', active !== null && !on && 'opacity-50')}
                      style={{ height: `${(total / top) * 100}%` }}
                    >
                      <div className="rounded-t-[4px] bg-chart-gold" style={{ flexGrow: d.walkIn }} />
                      <div className="bg-brand" style={{ flexGrow: d.online }} />
                    </div>
                    {on && (
                      <div
                        role="tooltip"
                        className={cx(
                          'pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-lg bg-ink px-3 py-2 text-[13px] text-white shadow-lg',
                          i > days.length * 0.7 ? 'right-0' : i < days.length * 0.3 ? 'left-0' : 'left-1/2 -translate-x-1/2',
                        )}
                      >
                        <p className="m-0 font-semibold">{dayLabel(d.date, true)}</p>
                        <p className="m-0">
                          <span className="font-mono">{d.online}</span> online · <span className="font-mono">{d.walkIn}</span> walk-in
                        </p>
                        <p className="m-0 text-on-dark">
                          <span className="font-mono">{total}</span> in all
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div aria-hidden="true" className={cx('mt-1.5 flex px-1 text-[12px] text-muted md:text-[13px]', many ? 'gap-[3px]' : 'gap-2.5 md:gap-3.5')}>
            {days.map((d, i) => (
              <span key={d.date} className="flex-1 text-center">
                {/* With 30 days, label every 5th to avoid collisions. */}
                {!many || i % 5 === 0 || i === days.length - 1 ? (many ? new Date(`${d.date}T12:00`).getDate() : dayLabel(d.date)) : ''}
              </span>
            ))}
          </div>
        </>
      )}
      <p className="m-0 mt-2.5 text-[13px] text-muted">Sample figures until the app is live; the chart draws from real sales after that.</p>
    </section>
  )
}
