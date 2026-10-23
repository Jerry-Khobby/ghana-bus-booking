import { useMemo, useState } from 'react'
import { Button, Heading } from '@/components/atoms'
import { PageHeader, SegmentedControl, StatTile } from '@/components/molecules'
import { SalesChart } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { REPORT_END, cashShare, dailySales, routeShare, type ReportRange } from '@/data/operator'
import { cedis } from '@/lib/format'

const rangeDays: Record<ReportRange, number> = { today: 1, '7d': 7, '30d': 30 }

function fmt(iso: string, withMonth = true) {
  return new Date(`${iso}T12:00`).toLocaleDateString('en-GB', withMonth ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' })
}

/** Average fare across routes, weighted by each route's share of tickets. */
const avgFare = routeShare.reduce((s, r) => s + r.share * r.fare, 0)

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsPage() {
  const [range, setRange] = useState<ReportRange>('7d')
  const [exported, setExported] = useState(false)

  const r = useMemo(() => {
    const days = dailySales.slice(-rangeDays[range])
    const tickets = days.reduce((s, d) => s + d.online + d.walkIn, 0)
    const walkIn = days.reduce((s, d) => s + d.walkIn, 0)
    const noShows = days.reduce((s, d) => s + d.noShows, 0)
    const revenue = Math.round(tickets * avgFare)
    const fill = Math.round(routeShare.reduce((s, x) => s + x.share * x.fill, 0))
    const byRoute = routeShare.map((x) => ({
      route: x.route,
      trips: x.tripsPerDay * days.length,
      fill: x.fill,
      revenue: Math.round(tickets * x.share * x.fare),
    }))
    const cash = cashShare.map((c) => ({
      agent: c.agent,
      tickets: Math.round(walkIn * c.share),
      amount: Math.round(walkIn * c.share * avgFare),
    }))
    const label = days.length === 1 ? fmt(days[0].date) : `${fmt(days[0].date, false)} – ${fmt(REPORT_END)}`
    return { days, tickets, noShows, revenue, fill, byRoute, cash, label }
  }, [range])

  // "Today" still charts the week so there is a trend to read.
  const chartDays = range === 'today' ? dailySales.slice(-7) : r.days

  function exportCsv() {
    downloadCsv(`seatline-report-${range}-${REPORT_END}.csv`, [
      ['Date', 'Online tickets', 'Walk-in tickets', 'No-shows'],
      ...r.days.map((d) => [d.date, d.online, d.walkIn, d.noShows]),
      [],
      ['Route', 'Trips', 'Seat fill %', 'Revenue (GHS)'],
      ...r.byRoute.map((x) => [x.route, x.trips, x.fill, x.revenue]),
    ])
    setExported(true)
  }

  return (
    <OperatorTemplate title="Reports">
      <PageHeader
        title="Reports"
        subtitle={`Confirmed payments only · ${r.label}`}
        action={
          <div className="flex w-full flex-col gap-2.5 md:w-auto md:flex-row md:items-center">
            <SegmentedControl
              label="Period"
              value={range}
              onChange={(v) => {
                setRange(v)
                setExported(false)
              }}
              options={[
                { value: 'today', label: 'Today' },
                { value: '7d', label: '7 days' },
                { value: '30d', label: '30 days' },
              ]}
            />
            <Button variant="outline" onClick={exportCsv} className="min-h-12 md:min-h-[52px]" aria-live="polite">
              {exported ? 'CSV downloaded' : 'Export CSV'}
            </Button>
          </div>
        }
      />

      <section aria-label="Totals" className="grid grid-cols-2 gap-2.5 md:gap-3.5 lg:grid-cols-4">
        <StatTile label="Revenue" value={cedis(r.revenue, { whole: true })} />
        <StatTile label="Tickets sold" value={r.tickets.toLocaleString('en-GH')} />
        <StatTile label="Average seat fill" value={`${r.fill}%`} />
        <StatTile label="No-shows" value={String(r.noShows)} danger />
      </section>

      <SalesChart days={chartDays} caption={range === '30d' ? 'Last 30 days' : 'Last 7 days'} />

      <div className="flex flex-col gap-4 md:gap-5 lg:flex-row lg:items-start">
        <section aria-labelledby="rp-route-h" className="min-w-0 rounded-[14px] border border-line bg-surface p-4 md:p-5 lg:flex-[2]">
          <Heading as="h2" size="sm" id="rp-route-h" className="mb-2.5 text-lg md:text-[19px]">
            By route
          </Heading>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[15px]">
              <thead>
                <tr className="text-left text-[13px] uppercase tracking-[0.05em] text-muted">
                  <th scope="col" className="border-b border-line p-2.5">Route</th>
                  <th scope="col" className="border-b border-line p-2.5">Trips</th>
                  <th scope="col" className="border-b border-line p-2.5">Seat fill</th>
                  <th scope="col" className="border-b border-line p-2.5 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {r.byRoute.map((x) => (
                  <tr key={x.route} className="[&:last-child>td]:border-b-0">
                    <td className="border-b border-sunken p-2.5 font-semibold">{x.route}</td>
                    <td className="border-b border-sunken p-2.5">{x.trips}</td>
                    <td className="border-b border-sunken p-2.5">{x.fill}%</td>
                    <td className="border-b border-sunken p-2.5 text-right">{cedis(x.revenue, { whole: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="rp-cash-h" className="rounded-[14px] border border-line bg-surface p-4 md:p-5 lg:flex-1">
          <Heading as="h2" size="sm" id="rp-cash-h" className="text-lg md:text-[19px]">
            Cash to collect from agents
          </Heading>
          <p className="m-0 mb-2.5 mt-1 text-sm text-muted">Walk-in cash sales by agent</p>
          <ul className="m-0 list-none p-0">
            {r.cash.map((c) => (
              <li key={c.agent} className="flex justify-between gap-2.5 border-b border-sunken py-2.5 last:border-b-0">
                <span>
                  {c.agent} · {c.tickets} tickets
                </span>
                <strong>{cedis(c.amount, { whole: true })}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </OperatorTemplate>
  )
}
