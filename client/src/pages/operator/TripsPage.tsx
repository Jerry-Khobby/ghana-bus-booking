import { useState } from 'react'
import { useOperator } from '@/app/OperatorContext'
import { ButtonLink, Dropdown } from '@/components/atoms'
import { FilterChips, FormField, PageHeader } from '@/components/molecules'
import { TripsTable, tripStatusText } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import type { TripStatus } from '@/data/types'
import { plural } from '@/lib/format'

type DateFilter = 'today' | 'tomorrow' | 'week'
type StatusFilter = 'all' | TripStatus

const dateOptions: Array<{ value: DateFilter; label: string }> = [
  { value: 'today', label: 'Today, Thu 22 Oct' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
]

export function TripsPage() {
  const { trips, routes } = useOperator()
  const [date, setDate] = useState<DateFilter>('today')
  const [route, setRoute] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  // The sample timetable is today's; nothing is published for tomorrow yet.
  const shown = trips.filter(
    (t) => date !== 'tomorrow' && (route === 'all' || t.route === route) && (status === 'all' || t.status === status),
  )

  return (
    <OperatorTemplate
      title="Trips"
      mobileAction={
        <ButtonLink to="/operator/trips/new" size="lg" block>
          New trip
        </ButtonLink>
      }
    >
      <PageHeader
        title="Trips"
        subtitle="Scheduled and fill-and-go trips across all routes"
        action={
          <ButtonLink to="/operator/trips/new" className="hidden md:inline-flex">
            New trip
          </ButtonLink>
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
                options={[{ value: 'all', label: 'All routes' }, ...routes.map((r) => ({ value: r.name, label: r.name }))]}
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

      <TripsTable
        rows={shown}
        variant="manage"
        footer={
          date === 'tomorrow'
            ? 'No trips published for tomorrow yet.'
            : `${plural(shown.length, 'trip')} shown · Departed and full trips are locked and cannot be edited.`
        }
      />
    </OperatorTemplate>
  )
}
