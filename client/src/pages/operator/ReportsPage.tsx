import { useState } from 'react'
import {
  downloadReportCsv,
  routeName,
  useReportByRoute,
  useReportCash,
  useReportDaily,
  useReportSummary,
  type ReportRange,
} from '@/api/admin'
import { errorMessage } from '@/api/client'
import { Button, Heading } from '@/components/atoms'
import { LoadState, PageHeader, SegmentedControl, StatTile } from '@/components/molecules'
import { SalesChart } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { cedis } from '@/lib/format'

function fmt(iso: string, withMonth = true) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(
    'en-GB',
    withMonth ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Accra' } : { weekday: 'short', day: 'numeric', timeZone: 'Africa/Accra' },
  )
}

const money = (pesewas: number) => cedis(pesewas / 100, { whole: true })

export function ReportsPage() {
  const [range, setRange] = useState<ReportRange>('7d')
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = useReportSummary(range)
  // "Today" still charts the week so there is a trend to read
  const daily = useReportDaily(range === 'today' ? '7d' : range)
  const byRoute = useReportByRoute(range)
  const cash = useReportCash(range)
  const s = summary.data
  const label = s ? (s.from === s.to ? fmt(s.from) : `${fmt(s.from, false)} – ${fmt(s.to)}`) : '…'

  async function exportCsv() {
    setExporting(true)
    setError(null)
    try {
      await downloadReportCsv(range)
      setExported(true)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <OperatorTemplate title="Reports">
      <PageHeader
        title="Reports"
        subtitle={`Confirmed payments only · ${label}`}
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
            <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting} className="min-h-12 md:min-h-[52px]" aria-live="polite">
              {exporting ? 'Exporting…' : exported ? 'CSV downloaded' : 'Export CSV'}
            </Button>
          </div>
        }
      />
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {s ? (
        <section aria-label="Totals" className="grid grid-cols-2 gap-2.5 md:gap-3.5 lg:grid-cols-4">
          <StatTile label="Revenue" value={money(s.revenuePesewas)} />
          <StatTile label="Tickets sold" value={s.ticketsSold.toLocaleString('en-GH')} />
          <StatTile label="Average seat fill" value={`${s.avgSeatFillPercent}%`} />
          <StatTile label="No-shows" value={String(s.noShows)} danger />
        </section>
      ) : (
        <LoadState pending={summary.isPending} error={summary.error} onRetry={() => void summary.refetch()} label="Loading totals…" />
      )}

      {daily.data ? (
        <SalesChart days={daily.data} caption={range === '30d' ? 'Last 30 days' : 'Last 7 days'} />
      ) : (
        <LoadState pending={daily.isPending} error={daily.error} onRetry={() => void daily.refetch()} label="Loading sales…" />
      )}

      <div className="flex flex-col gap-4 md:gap-5 lg:flex-row lg:items-start">
        <section aria-labelledby="rp-route-h" className="min-w-0 rounded-[14px] border border-line bg-surface p-4 md:p-5 lg:flex-[2]">
          <Heading as="h2" size="sm" id="rp-route-h" className="mb-2.5 text-lg md:text-[19px]">
            By route
          </Heading>
          {!byRoute.data ? (
            <LoadState pending={byRoute.isPending} error={byRoute.error} onRetry={() => void byRoute.refetch()} />
          ) : (
            <>
              {/* Phones: one line per route, as in the phone design. */}
              <ul className="m-0 list-none p-0 md:hidden">
                {byRoute.data.map((x) => (
                  <li key={x.route.id} className="flex items-center justify-between gap-3 border-b border-sunken py-2.5 last:border-b-0">
                    <div className="min-w-0">
                      <p className="m-0 font-semibold">{routeName(x.route)}</p>
                      <p className="m-0 text-[13px] text-muted">
                        {x.trips} trips · {x.seatFillPercent}% seat fill
                      </p>
                    </div>
                    <strong className="shrink-0">{money(x.revenuePesewas)}</strong>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
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
                    {byRoute.data.map((x) => (
                      <tr key={x.route.id} className="[&:last-child>td]:border-b-0">
                        <td className="border-b border-sunken p-2.5 font-semibold">{routeName(x.route)}</td>
                        <td className="border-b border-sunken p-2.5">{x.trips}</td>
                        <td className="border-b border-sunken p-2.5">{x.seatFillPercent}%</td>
                        <td className="border-b border-sunken p-2.5 text-right">{money(x.revenuePesewas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="rp-cash-h" className="rounded-[14px] border border-line bg-surface p-4 md:p-5 lg:flex-1">
          <Heading as="h2" size="sm" id="rp-cash-h" className="text-lg md:text-[19px]">
            Walk-in cash by agent
          </Heading>
          <p className="m-0 mb-2.5 mt-1 text-sm text-muted">Collect it on the Agents page</p>
          {!cash.data ? (
            <LoadState pending={cash.isPending} error={cash.error} onRetry={() => void cash.refetch()} />
          ) : cash.data.length === 0 ? (
            <p className="m-0 text-sm text-muted">No cash sales in this period.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {cash.data.map((c) => (
                <li key={c.agent.id} className="flex justify-between gap-2.5 border-b border-sunken py-2.5 last:border-b-0">
                  <span>
                    {c.agent.name} · {c.tickets} tickets
                    {c.unsettledPesewas > 0 && <span className="block text-[13px] text-muted">{money(c.unsettledPesewas)} still to collect</span>}
                  </span>
                  <strong>{money(c.cashPesewas)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </OperatorTemplate>
  )
}
