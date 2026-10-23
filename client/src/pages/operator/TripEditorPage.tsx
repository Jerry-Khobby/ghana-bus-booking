import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useOperator } from '@/app/OperatorContext'
import { PageHeader } from '@/components/molecules'
import { TripForm, TripFormActions, TripPreview, isEditableTrip, type TripDraft } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { OPERATOR_NAME, bayOptions } from '@/data/operator'
import type { BusType, OperatorTrip } from '@/data/types'
import { buildRows } from '@/lib/seats'
import { NotFoundPage } from '../NotFoundPage'

const shortType: Record<BusType, string> = {
  'Air-conditioned coach': 'AC coach',
  'Standard bus': 'Standard',
  Minibus: 'Minibus',
}

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function prettyDate(iso: string) {
  return new Date(`${iso}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** New trip at /operator/trips/new; editing an open trip at /operator/trips/:tripId/edit. */
export function TripEditorPage() {
  const { tripId } = useParams()
  // Remount per trip so the form starts from that trip's values.
  return <TripEditor key={tripId ?? 'new'} tripId={tripId} />
}

function TripEditor({ tripId }: { tripId: string | undefined }) {
  const navigate = useNavigate()
  const { trips, buses, routes, layouts, saveTrip } = useOperator()
  const existing = tripId ? trips.find((t) => t.id === tripId) : undefined

  const activeBuses = buses.filter((b) => b.status === 'active')
  const seatsFor = (plate: string) => {
    const bus = buses.find((b) => b.plate === plate)
    const layout = layouts.find((l) => l.id === bus?.layoutId)
    return layout ? buildRows(layout.layout).total : 49
  }

  const [draft, setDraft] = useState<TripDraft>(() => {
    const route = routes.find((r) => r.name === existing?.route) ?? routes[0]
    const scheduled = existing ? /^\d{2}:\d{2}$/.test(existing.when) : true
    return {
      routeId: route.id,
      busPlate: existing?.plate ?? activeBuses[1]?.plate ?? activeBuses[0].plate,
      mode: scheduled ? 'scheduled' : 'fill',
      date: tomorrow(),
      time: scheduled && existing ? existing.when : '14:30',
      startLoading: '10:00',
      leaveBy: '13:00',
      fare: String(existing?.fare ?? route.fare),
      bay: existing?.bay ?? 6,
      openOnline: true,
    }
  })

  if (tripId && (!existing || !isEditableTrip(existing))) {
    return <NotFoundPage title="This trip cannot be edited" body="Departed and full trips are locked. Pick an open trip from the Trips page." />
  }

  const route = routes.find((r) => r.id === draft.routeId) ?? routes[0]
  const bus = buses.find((b) => b.plate === draft.busPlate) ?? activeBuses[0]
  const when = draft.mode === 'scheduled' ? `Departs ${prettyDate(draft.date)}, ${draft.time}` : `Leaves when full · by ${draft.leaveBy} latest`
  const title = existing ? 'Edit trip' : 'New trip'
  const submitLabel = existing ? 'Save changes' : 'Publish trip'

  function publish() {
    const trip: OperatorTrip = {
      id: existing?.id ?? `${draft.busPlate.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`,
      route: route.name,
      plate: draft.busPlate,
      when: draft.mode === 'scheduled' ? draft.time : 'When full',
      bay: draft.bay,
      status: existing?.status ?? (draft.mode === 'scheduled' ? 'scheduled' : 'loading'),
      sold: existing?.sold ?? 0,
      capacity: seatsFor(draft.busPlate),
      fare: Number(draft.fare) || route.fare,
    }
    saveTrip(trip)
    navigate('/operator/trips')
  }

  return (
    <OperatorTemplate title={title} context="trips" mobileAction={<TripFormActions submitLabel={submitLabel} />}>
      <PageHeader back={{ to: '/operator/trips', label: 'Trips' }} title={title} subtitle={existing ? `${existing.route} · ${existing.plate}` : undefined} />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        <TripForm
          draft={draft}
          onChange={setDraft}
          onSubmit={publish}
          routes={routes}
          buses={activeBuses.map((b) => ({ plate: b.plate, label: `${b.plate} · ${shortType[b.type]} · ${seatsFor(b.plate)} seats` }))}
          bays={bayOptions}
          submitLabel={submitLabel}
        />
        <TripPreview
          mode={draft.mode}
          when={when}
          plate={draft.busPlate}
          operator={OPERATOR_NAME}
          busType={shortType[bus.type]}
          route={route.name}
          seats={seatsFor(draft.busPlate) - (existing?.sold ?? 0)}
          fare={Number(draft.fare)}
          bay={draft.bay}
        />
      </div>
    </OperatorTemplate>
  )
}
