import { toOperatorTrip, useOverview } from '@/api/admin'
import { pesewasToCedis } from '@/api/catalog'
import { useAuth } from '@/app/AuthContext'
import { ButtonLink, Heading } from '@/components/atoms'
import { LoadState, StatTile } from '@/components/molecules'
import { TripsTable } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { cedis } from '@/lib/format'

export function OperatorOverviewPage() {
  return (
    <OperatorTemplate
      title="Overview"
      mobileAction={
        <ButtonLink to="/operator/trips/new" size="lg" block>
          New trip
        </ButtonLink>
      }
    >
      <Overview />
    </OperatorTemplate>
  )
}

function Overview() {
  const overview = useOverview()
  const { staff } = useAuth()
  const data = overview.data

  return (
    <>
      <div className="hidden flex-wrap items-end justify-between gap-4 md:flex">
        <div>
          <p className="m-0 text-sm text-muted">
            <span className="lg:hidden">{staff?.operator?.name} · today</span>
            <span className="hidden lg:inline">Today</span>
          </p>
          <Heading as="h1" size="xl">
            Overview
          </Heading>
        </div>
        <ButtonLink to="/operator/trips/new">New trip</ButtonLink>
      </div>

      {data ? (
        <>
          <section aria-label="Today in numbers" className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
            <StatTile label="Tickets sold" value={String(data.ticketsSold)} note="online and walk-in" />
            <StatTile label="Revenue" value={cedis(pesewasToCedis(data.revenuePesewas), { whole: true })} note="confirmed payments only" />
            <StatTile label="Average seat fill" value={`${data.seatFillPercent}%`} note="trips that have loaded" />
            <StatTile label="Failed payments" value={String(data.failedPayments)} note="seats released" danger />
          </section>
          <TripsTable rows={data.trips.map(toOperatorTrip)} />
        </>
      ) : (
        <LoadState pending={overview.isPending} error={overview.error} onRetry={() => void overview.refetch()} label="Loading today…" />
      )}
    </>
  )
}
