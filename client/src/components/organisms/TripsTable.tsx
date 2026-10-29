import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Heading, ProgressBar } from '@/components/atoms'
import { TripStatusBadge } from '@/components/molecules'
import type { OperatorTrip, TripStatus } from '@/data/types'
import { cedis } from '@/lib/format'
import { ResponsiveTable, RowCard, StackedCell, type Column } from './ResponsiveTable'

export interface OperatorTripRow extends OperatorTrip {
  revenue?: number
  /** The server's say on whether it can still be changed. */
  editable?: boolean
}

export const tripStatusText: Record<TripStatus, string> = {
  loading: 'Loading',
  scheduled: 'Scheduled',
  full: 'Full',
  departed: 'Departed',
}

export function isEditableTrip(t: OperatorTripRow) {
  return t.editable ?? (t.status === 'loading' || t.status === 'scheduled')
}

function SoldBar({ trip, wide }: { trip: OperatorTripRow; wide?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <ProgressBar
        className={wide ? 'flex-1' : 'w-[90px]'}
        size="sm"
        value={trip.capacity ? (trip.sold / trip.capacity) * 100 : 0}
        tone={trip.status === 'departed' ? 'inactive' : 'brand'}
      />
      <span className="font-mono text-[13px] md:text-sm">
        {trip.sold}/{trip.capacity}
      </span>
    </div>
  )
}

interface TripsTableProps {
  rows: OperatorTripRow[]
  /** `overview` shows revenue; `manage` shows bay and an Edit link. */
  variant?: 'overview' | 'manage'
  footer?: ReactNode
}

/** Today's trips: a table from tablet up, stacked cards on phones. */
export function TripsTable({ rows, variant = 'overview', footer }: TripsTableProps) {
  const manage = variant === 'manage'

  const columns: Column<OperatorTripRow>[] = [
    { header: 'Route', cell: (t) => t.route, className: 'font-semibold' },
    { header: 'Bus', cell: (t) => t.plate, className: 'font-mono text-sm' },
    { header: 'Departure', cell: (t) => t.when },
    ...(manage ? [{ header: 'Bay', cell: (t: OperatorTripRow) => `Bay ${t.bay}` }] : []),
    { header: 'Status', cell: (t) => <TripStatusBadge status={t.status} label={tripStatusText[t.status]} /> },
    { header: 'Seats sold', cell: (t) => <SoldBar trip={t} /> },
    manage
      ? {
          header: <span className="sr-only">Actions</span>,
          cell: (t: OperatorTripRow) =>
            isEditableTrip(t) ? (
              <Link to={`/operator/trips/${t.id}/edit`} className="font-semibold">
                Edit<span className="sr-only"> {t.plate}</span>
              </Link>
            ) : null,
          className: 'text-right',
        }
      : { header: 'Revenue', cell: (t: OperatorTripRow) => cedis(t.revenue ?? t.sold * t.fare), className: 'text-right' },
  ]

  // Tablet: route, plate and departure share one "Trip" cell; the sold bar becomes a count.
  const tabletColumns: Column<OperatorTripRow>[] = [
    {
      header: 'Trip',
      cell: (t) => (
        <StackedCell
          title={t.route}
          detail={
            <>
              <span className="font-mono">{t.plate}</span> · {t.when}
              {manage ? ` · Bay ${t.bay}` : ''}
            </>
          }
        />
      ),
    },
    { header: 'Status', cell: (t) => <TripStatusBadge status={t.status} label={tripStatusText[t.status]} /> },
    { header: 'Sold', cell: (t) => `${t.sold}/${t.capacity}`, className: 'font-mono text-sm' },
    columns[columns.length - 1],
  ]

  return (
    <ResponsiveTable
      label="Trips"
      rows={rows}
      rowKey={(t) => t.id}
      columns={columns}
      tabletColumns={tabletColumns}
      minWidth={manage ? 760 : 680}
      header={
        manage ? undefined : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading size="sm" className="text-[19px] md:text-xl">
              Today's trips
            </Heading>
            <span className="hidden text-sm text-muted md:inline">Updates live</span>
          </div>
        )
      }
      footer={footer}
      empty={<p className="m-0 p-6 text-center text-muted">No trips match these filters.</p>}
      card={(t) => (
        <RowCard>
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-base font-semibold">{t.route}</h3>
            <TripStatusBadge status={t.status} label={tripStatusText[t.status]} size="sm" />
          </div>
          <p className="m-0 text-[13px] text-muted">
            <span className="font-mono">{t.plate}</span> · {t.when}
            {manage ? ` · Bay ${t.bay}` : ''}
          </p>
          <div className="flex items-center gap-2.5">
            <div className="flex-1">
              <SoldBar trip={t} wide />
            </div>
            {manage ? (
              isEditableTrip(t) ? (
                <Link to={`/operator/trips/${t.id}/edit`} className="inline-flex min-h-11 items-center px-1 font-semibold">
                  Edit<span className="sr-only"> {t.plate}</span>
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center text-[13px] text-muted">Locked</span>
              )
            ) : (
              <span className="text-[13px] text-muted">{cedis(t.revenue ?? t.sold * t.fare)}</span>
            )}
          </div>
        </RowCard>
      )}
    />
  )
}
