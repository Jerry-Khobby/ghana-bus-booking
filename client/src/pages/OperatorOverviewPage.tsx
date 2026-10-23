import { ButtonLink, Heading } from '@/components/atoms'
import { StatTile } from '@/components/molecules'
import { TripsTable, type OperatorTripRow } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { failedPaymentsToday, operatorTrips } from '@/data/mock'
import { cedis } from '@/lib/format'

export function OperatorOverviewPage() {
  const rows: OperatorTripRow[] = operatorTrips.map((t) => ({ ...t, revenue: t.sold * t.fare }))
  const sold = rows.reduce((sum, r) => sum + r.sold, 0)
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const departed = rows.filter((r) => r.status === 'departed')
  const fill = departed.length
    ? Math.round((departed.reduce((s, r) => s + r.sold / r.capacity, 0) / departed.length) * 100)
    : 0

  return (
    <OperatorTemplate
      title="Overview"
      mobileAction={
        <ButtonLink to="/operator/trips/new" size="lg" block>
          New trip
        </ButtonLink>
      }
    >
      <div className="hidden flex-wrap items-end justify-between gap-4 md:flex">
        <div>
          <p className="m-0 text-sm text-muted">Today</p>
          <Heading as="h1" size="xl">
            Overview
          </Heading>
        </div>
        <ButtonLink to="/operator/trips/new">New trip</ButtonLink>
      </div>

      <section aria-label="Today in numbers" className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
        <StatTile label="Tickets sold" value={String(sold)} note="online and walk-in" />
        <StatTile label="Revenue" value={cedis(revenue)} note="confirmed payments only" />
        <StatTile label="Average seat fill" value={`${fill}%`} note="departed trips" />
        <StatTile label="Failed payments" value={String(failedPaymentsToday)} note="seats released" danger />
      </section>

      <TripsTable rows={rows} />
    </OperatorTemplate>
  )
}
