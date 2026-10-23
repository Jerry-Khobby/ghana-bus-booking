import { Card, Heading, ProgressBar } from '@/components/atoms'
import { TripStatusBadge } from '@/components/molecules'
import type { TripStatus } from '@/data/types'
import { cedis } from '@/lib/format'

export interface OperatorTripRow {
  route: string
  plate: string
  when: string
  status: TripStatus
  sold: number
  capacity: number
  revenue: number
}

const statusText: Record<TripStatus, string> = {
  loading: 'Loading',
  scheduled: 'Scheduled',
  full: 'Full',
  departed: 'Departed',
}

const th = 'border-b border-line px-3 py-2.5'
const td = 'border-b border-sunken p-3'

/** Today's trips: a table from tablet up, stacked cards on phones. */
export function TripsTable({ rows }: { rows: OperatorTripRow[] }) {
  return (
    <section aria-labelledby="trips-h">
      <Card radius="md" className="hidden !p-5 md:block">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Heading id="trips-h" size="sm">
            Today's trips
          </Heading>
          <span className="text-sm text-muted">Updates live</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-[13px] uppercase tracking-[0.05em] text-muted">
                <th scope="col" className={th}>Route</th>
                <th scope="col" className={th}>Bus</th>
                <th scope="col" className={th}>Departure</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Seats sold</th>
                <th scope="col" className={`${th} text-right`}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.plate}>
                  <td className={`${td} font-semibold`}>{r.route}</td>
                  <td className={`${td} font-mono text-sm`}>{r.plate}</td>
                  <td className={td}>{r.when}</td>
                  <td className={td}>
                    <TripStatusBadge status={r.status} label={statusText[r.status]} />
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2.5">
                      <ProgressBar className="w-[90px]" size="sm" value={(r.sold / r.capacity) * 100} tone={r.status === 'departed' ? 'inactive' : 'brand'} />
                      <span className="font-mono text-sm">
                        {r.sold}/{r.capacity}
                      </span>
                    </div>
                  </td>
                  <td className={`${td} text-right`}>{cedis(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-col gap-2.5 md:hidden">
        <h2 className="m-0 font-display text-[19px] font-bold">Today's trips</h2>
        {rows.map((r) => (
          <article key={r.plate} className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-base font-semibold">{r.route}</h3>
              <TripStatusBadge status={r.status} label={statusText[r.status]} size="sm" />
            </div>
            <p className="m-0 text-[13px] text-muted">
              <span className="font-mono">{r.plate}</span> · {r.when}
            </p>
            <div className="flex items-center gap-2.5">
              <ProgressBar className="flex-1" size="sm" value={(r.sold / r.capacity) * 100} tone={r.status === 'departed' ? 'inactive' : 'brand'} />
              <span className="font-mono text-[13px]">
                {r.sold}/{r.capacity}
              </span>
              <span className="text-[13px] text-muted">{cedis(r.revenue)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
