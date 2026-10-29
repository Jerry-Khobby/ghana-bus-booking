import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toTrip, useStations, useTripSearch } from '@/api/catalog'
import { useBooking } from '@/app/BookingContext'
import { LoadState } from '@/components/molecules'
import { RouteBanner, TripFilters, TripResultCard, type ShowFilter } from '@/components/organisms'
import { isoDate } from '@/components/organisms/SearchForm'
import { PublicTemplate } from '@/components/templates'
import { busTypes } from '@/data/mock'
import { plural } from '@/lib/format'
import { MAX_SEATS } from '@/lib/seats'

function toggle(list: string[], item: string) {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item]
}

function dayLabel(date: string) {
  if (date === isoDate(0)) return 'Today'
  if (date === isoDate(1)) return 'Tomorrow'
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Accra',
  })
}

export function ResultsPage() {
  const [params] = useSearchParams()
  const { passengers, setPassengers } = useBooking()
  const [show, setShow] = useState<ShowFilter>('all')
  const [types, setTypes] = useState<string[]>([...busTypes])
  // Operators the passenger has unticked; new ones in the results start ticked
  const [hiddenOps, setHiddenOps] = useState<string[]>([])

  const stations = useStations()
  const fromId = params.get('from') ?? ''
  const toId = params.get('to') ?? ''
  const date = params.get('date') ?? isoDate(0)
  const from = stations.data?.find((s) => s.id === fromId)
  const to = stations.data?.find((s) => s.id === toId)
  const search = useTripSearch(fromId && toId ? { from: fromId, to: toId, date } : null)

  // A shared link carries the passenger count; keep the booking in step with it.
  const paxParam = Number(params.get('pax'))
  useEffect(() => {
    if (paxParam >= 1 && paxParam <= MAX_SEATS && paxParam !== passengers) setPassengers(paxParam)
  }, [paxParam, passengers, setPassengers])

  const trips = useMemo(
    () => (search.data ?? []).map((t) => toTrip(t, from && to ? { origin: from, destination: to } : undefined)),
    [search.data, from, to],
  )
  const operators = useMemo(() => [...new Set(trips.map((t) => t.operator))].sort(), [trips])
  const ops = operators.filter((o) => !hiddenOps.includes(o))
  const visible = trips.filter(
    (t) => (show === 'all' || t.status === 'loading') && types.includes(t.busType) && ops.includes(t.operator),
  )

  const noRoute = !fromId || !toId
  // Shown instead of the list: no route picked, the first search still out, or it failed
  const waiting = !noRoute && !search.data && (search.isPending || search.isError)

  return (
    <PublicTemplate
      bannerIsMobileHeader
      banner={
        <RouteBanner
          from={{ city: from?.city ?? '…', station: from?.name }}
          to={{ city: to?.city ?? '…', station: to?.name }}
          caption={`${dayLabel(date)} · ${plural(passengers, 'passenger')}`}
        />
      }
    >
      <div className="flex flex-col gap-3 pt-3.5 md:gap-5 md:pt-5 lg:flex-row lg:items-start lg:gap-7 lg:pt-7">
        <TripFilters
          show={show}
          onShowChange={setShow}
          busTypes={busTypes}
          selectedBusTypes={types}
          onToggleBusType={(t) => setTypes((l) => toggle(l, t))}
          operators={operators}
          selectedOperators={ops}
          onToggleOperator={(o) => setHiddenOps((l) => toggle(l, o))}
        />
        <section aria-label="Buses" className="flex min-w-0 flex-1 flex-col gap-3 md:gap-3.5">
          {noRoute ? (
            <p role="status" className="m-0 rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">
              Pick where you are going on the home page.
            </p>
          ) : waiting ? (
            <LoadState
              pending={search.isPending && search.fetchStatus !== 'idle'}
              error={search.error}
              onRetry={() => void search.refetch()}
              label="Finding buses…"
            />
          ) : (
            <>
              <p className="m-0 text-sm text-muted md:text-[15px]" aria-live="polite">
                {visible.length} {show === 'loading' ? 'buses loading now' : `buses on this route ${dayLabel(date).toLowerCase() === 'today' ? 'today' : 'that day'}`}
              </p>
              {visible.map((t) => (
                <TripResultCard key={t.id} trip={t} passengers={passengers} />
              ))}
              {visible.length === 0 && (
                <p className="m-0 rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">
                  {trips.length ? 'No buses match these filters.' : 'No buses on this route that day. Try another day.'}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </PublicTemplate>
  )
}
