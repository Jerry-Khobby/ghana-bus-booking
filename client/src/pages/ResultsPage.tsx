import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useBooking } from '@/app/BookingContext'
import { RouteBanner, TripFilters, TripResultCard, type ShowFilter } from '@/components/organisms'
import { PublicTemplate } from '@/components/templates'
import { busTypes, operators, trips } from '@/data/mock'
import { plural } from '@/lib/format'
import { MAX_SEATS } from '@/lib/seats'

function toggle(list: string[], item: string) {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item]
}

/** "Accra — Circle" → { city: "Accra", station: "Circle" } */
function parsePlace(value: string | null, fallback: string) {
  const [city, station] = (value ?? fallback).split('—').map((s) => s.trim())
  return { city, station }
}

function dayLabel(when: string | null, date: string | null) {
  if (when === 'tomorrow') return 'Tomorrow'
  if (when === 'pick' && date) {
    return new Date(`${date}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  return 'Today'
}

export function ResultsPage() {
  const [params] = useSearchParams()
  const { passengers, setPassengers } = useBooking()
  const [show, setShow] = useState<ShowFilter>('all')
  const [types, setTypes] = useState<string[]>(['Air-conditioned coach', 'Standard bus'])
  const [ops, setOps] = useState<string[]>([...operators])

  // A shared link carries the passenger count; keep the booking in step with it.
  const paxParam = Number(params.get('pax'))
  useEffect(() => {
    if (paxParam >= 1 && paxParam <= MAX_SEATS && paxParam !== passengers) setPassengers(paxParam)
  }, [paxParam, passengers, setPassengers])

  const visible = useMemo(
    () => trips.filter((t) => (show === 'all' || t.status === 'loading') && types.includes(t.busType) && ops.includes(t.operator)),
    [show, types, ops],
  )

  return (
    <PublicTemplate
      bannerIsMobileHeader
      banner={
        <RouteBanner
          from={parsePlace(params.get('from'), 'Accra — Circle')}
          to={parsePlace(params.get('to'), 'Kumasi — Asafo')}
          caption={`${dayLabel(params.get('when'), params.get('date'))} · ${plural(passengers, 'passenger')}`}
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
          onToggleOperator={(o) => setOps((l) => toggle(l, o))}
        />
        <section aria-label="Buses" className="flex min-w-0 flex-1 flex-col gap-3 md:gap-3.5">
          <p className="m-0 text-sm text-muted md:text-[15px]" aria-live="polite">
            {visible.length} {show === 'loading' ? 'buses loading now' : 'buses on this route today'}
          </p>
          {visible.map((t) => (
            <TripResultCard key={t.id} trip={t} passengers={passengers} />
          ))}
          {visible.length === 0 && (
            <p className="m-0 rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">
              No buses match these filters.
            </p>
          )}
        </section>
      </div>
    </PublicTemplate>
  )
}
