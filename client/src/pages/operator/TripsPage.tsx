import { useState } from 'react'
import { API_TRIP_STATUS, routeName, toOperatorTrip, useAdminTrips, useRoutes, type TripsFilter } from '@/api/admin'
import { ButtonLink, Dropdown } from '@/components/atoms'
import { FilterChips, FormField, LoadState, PageHeader } from '@/components/molecules'
import { TripsTable, tripStatusText } from '@/components/organisms'
import { isoDate } from '@/components/organisms/SearchForm'
import { OperatorTemplate } from '@/components/templates'
import type { TripStatus } from '@/data/types'
import { plural } from '@/lib/format'

type DateFilter = 'today' | 'tomorrow' | 'week'
type StatusFilter = 'all' | TripStatus

const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Accra' })
const dateOptions: Array<{ value: DateFilter; label: string }> = [
  { value: 'today', label: `Today, ${today}` },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'Next 7 days' },
]

function dates(filter: DateFilter): Pick<TripsFilter, 'date' | 'from' | 'to'> {
  if (filter === 'today') return { date: isoDate(0) }
  if (filter === 'tomorrow') return { date: isoDate(1) }
  return { from: isoDate(0), to: isoDate(6) }
}

export function TripsPage() {
  return (
    <OperatorTemplate
      title="Trips"
      context="trips"
      mobileAction={
        <ButtonLink to="/operator/trips/new" size="lg" block>
          New trip
        </ButtonLink>
      }
    >
      <Trips />
    </OperatorTemplate>
  )
}

function Trips() {
  const [date, setDate] = useState<DateFilter>('today')
  const [route, setRoute] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const routes = useRoutes()
  const trips = useAdminTrips({
    ...dates(date),
    routeId: route === 'all' ? undefined : route,
    status: status === 'all' ? undefined : [API_TRIP_STATUS[status]],
  })
  const rows = (trips.data?.items ?? []).map(toOperatorTrip)

  return (
    <>
      <PageHeader
        title="Trips"
        subtitle="Scheduled and fill-and-go trips across all routes"
        action={
          <div className="hidden md:block">
            <ButtonLink to="/operator/trips/new">New trip</ButtonLink>
          </div>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="grid grid-cols-2 gap-2.5 md:flex md:gap-3">
          <div className="md:w-48">
            <FormField id="tr-date" label="Date">
              <Dropdown id="tr-date" labelledBy="tr-date-label" size="sm" value={date} options={dateOptions} onChange={setDate} />
            </FormField>
          </div>
          <div className="md:w-52">
            <FormField id="tr-route" label="Route">
              <Dropdown
                id="tr-route"
                labelledBy="tr-route-label"
                size="sm"
                value={route}
                options={[{ value: 'all', label: 'All routes' }, ...(routes.data ?? []).map((r) => ({ value: r.id, label: routeName(r) }))]}
                onChange={setRoute}
              />
            </FormField>
          </div>
        </div>
        <FilterChips<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All' },
            ...(['loading', 'scheduled', 'full', 'departed'] as const).map((s) => ({ value: s, label: tripStatusText[s] })),
          ]}
        />
      </div>

      {trips.data ? (
        <TripsTable
          rows={rows}
          variant="manage"
          footer={
            <>
              {plural(rows.length, 'trip')} shown · Departed, full and cancelled trips are locked
              <span className="hidden lg:inline"> and cannot be edited</span>.
            </>
          }
        />
      ) : (
        <LoadState pending={trips.isPending} error={trips.error} onRetry={() => void trips.refetch()} label="Loading trips…" />
      )}
    </>
  )
}
