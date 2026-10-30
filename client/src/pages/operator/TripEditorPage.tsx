import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  adminKeys,
  BUS_TYPE_NAMES,
  cancelTrip,
  createTrip,
  routeName,
  updateTrip,
  useAdminTrip,
  useBays,
  useBuses,
  useRefreshAdmin,
  useRoutes,
  type ApiAdminTrip,
  type TripBody,
} from '@/api/admin'
import { hhmm } from '@/api/catalog'
import { errorMessage, isApiError } from '@/api/client'
import { useAuth } from '@/app/AuthContext'
import { Button, Card, Heading, TextInput } from '@/components/atoms'
import { FormField, LoadState, PageHeader } from '@/components/molecules'
import { TripForm, TripFormActions, TripPreview, type TripDraft } from '@/components/organisms'
import { isoDate } from '@/components/organisms/SearchForm'
import { OperatorTemplate } from '@/components/templates'
import { cedis } from '@/lib/format'

const shortType: Record<string, string> = { AC_COACH: 'AC coach', STANDARD: 'Standard', MINIBUS: 'Minibus' }

function prettyDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Accra' })
}

/** Ghana is on GMT all year, so a date and time typed here are UTC. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00Z`).toISOString()
const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined)

/** New trip at /operator/trips/new; editing an open trip at /operator/trips/:tripId/edit. */
export function TripEditorPage() {
  const { tripId } = useParams()
  const title = tripId ? 'Edit trip' : 'New trip'
  return (
    <OperatorTemplate title={title} context="trips" mobileAction={<TripFormActions submitLabel={tripId ? 'Save changes' : 'Publish trip'} />}>
      <TripEditorData key={tripId ?? 'new'} tripId={tripId} />
    </OperatorTemplate>
  )
}

/** Waits for everything the form needs. */
function TripEditorData({ tripId }: { tripId: string | undefined }) {
  const routes = useRoutes()
  const buses = useBuses()
  const bays = useBays()
  const trip = useAdminTrip(tripId)
  const queries = [routes, buses, bays, ...(tripId ? [trip] : [])]
  const failed = queries.find((q) => q.isError)

  if (tripId && isApiError(trip.error, 'NOT_FOUND')) {
    return <Locked title="We could not find that trip" body="It may belong to another operator, or the link is wrong." />
  }
  if (!routes.data || !buses.data || !bays.data || (tripId && !trip.data)) {
    return <LoadState pending={!failed} error={failed?.error} onRetry={() => queries.forEach((q) => void q.refetch())} label="Loading the timetable…" />
  }
  if (trip.data && !trip.data.editable) {
    return (
      <Locked
        title="This trip can no longer be edited"
        body={`${trip.data.status === 'CANCELLED' ? 'It was cancelled.' : 'Departed and full trips are locked.'} Pick an open trip from the Trips page.`}
      />
    )
  }
  if (!routes.data.length || !buses.data.some((b) => b.status === 'ACTIVE')) {
    return (
      <Card>
        <p className="m-0">Add a route and an active bus first: a trip needs both.</p>
      </Card>
    )
  }
  return <TripEditor existing={trip.data} routes={routes.data} buses={buses.data} bays={bays.data} />
}

/** A dead end inside the dashboard (not the passenger site's not-found page). */
function Locked({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate()
  return (
    <Card className="flex flex-col items-start gap-3">
      <Heading as="h2" size="sm">
        {title}
      </Heading>
      <p className="m-0 text-muted">{body}</p>
      <Button variant="outline" onClick={() => navigate('/operator/trips')}>
        Back to trips
      </Button>
    </Card>
  )
}

function TripEditor({
  existing,
  routes,
  buses,
  bays,
}: {
  existing?: ApiAdminTrip
  routes: NonNullable<ReturnType<typeof useRoutes>['data']>
  buses: NonNullable<ReturnType<typeof useBuses>['data']>
  bays: NonNullable<ReturnType<typeof useBays>['data']>
}) {
  const navigate = useNavigate()
  const refresh = useRefreshAdmin()
  const { staff } = useAuth()
  const activeBuses = buses.filter((b) => b.status === 'ACTIVE' || b.id === existing?.bus?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState<TripDraft>(() => {
    const route = routes.find((r) => r.id === existing?.route.id) ?? routes.find((r) => r.active) ?? routes[0]
    const fixed = existing ? existing.mode === 'FIXED_TIME' : true
    return {
      routeId: route.id,
      busId: existing?.bus?.id ?? activeBuses[0].id,
      mode: fixed ? 'scheduled' : 'fill',
      date: dayOf(existing?.departureAt ?? existing?.loadingStartsAt) ?? isoDate(1),
      time: hhmm(existing?.departureAt) ?? '14:30',
      startLoading: hhmm(existing?.loadingStartsAt) ?? '10:00',
      leaveBy: hhmm(existing?.leaveBy) ?? '13:00',
      fare: String((existing?.farePesewas ?? route.baseFarePesewas) / 100),
      bayId: existing?.bay.id ?? '',
      openOnline: existing?.onlineBookingOpen ?? true,
    }
  })

  const route = routes.find((r) => r.id === draft.routeId) ?? routes[0]
  // Buses board at the route's starting station
  const stationBays = bays.filter((b) => b.station.id === route.origin.id).sort((a, b) => a.number - b.number)
  useEffect(() => {
    if (!stationBays.some((b) => b.id === draft.bayId) && stationBays[0]) setDraft((d) => ({ ...d, bayId: stationBays[0].id }))
  }, [stationBays, draft.bayId])

  const bus = buses.find((b) => b.id === draft.busId) ?? activeBuses[0]
  const bay = stationBays.find((b) => b.id === draft.bayId)
  const when = draft.mode === 'scheduled' ? `Departs ${prettyDate(draft.date)}, ${draft.time}` : `Leaves when full · by ${draft.leaveBy} latest`
  const submitLabel = existing ? 'Save changes' : 'Publish trip'

  async function publish() {
    setBusy(true)
    setError(null)
    const body: TripBody = {
      routeId: draft.routeId,
      busId: draft.busId,
      bayId: draft.bayId,
      ...(draft.mode === 'scheduled'
        ? { mode: 'FIXED_TIME' as const, departureAt: at(draft.date, draft.time) }
        : { mode: 'WHEN_FULL' as const, loadingStartsAt: at(draft.date, draft.startLoading), leaveBy: at(draft.date, draft.leaveBy) }),
      farePesewas: Math.round(Number(draft.fare) * 100),
      onlineBookingOpen: draft.openOnline,
    }
    try {
      if (existing) await updateTrip(existing.id, body)
      else await createTrip(body)
      await refresh()
      navigate('/operator/trips')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        back={{ to: '/operator/trips', label: 'Trips' }}
        title={existing ? 'Edit trip' : 'New trip'}
        subtitle={existing ? `${routeName(existing.route)} · ${existing.bus?.plate}` : undefined}
      />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        <TripForm
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void publish()}
          routes={routes
            .filter((r) => r.active || r.id === existing?.route.id)
            .map((r) => ({ id: r.id, name: routeName(r), stations: `${r.origin.name} → ${r.destination.name}`, fare: r.baseFarePesewas / 100 }))}
          buses={activeBuses.map((b) => ({ id: b.id, label: `${b.plate} · ${shortType[b.type]} · ${b.layout.seatCount} seats` }))}
          bays={stationBays}
          submitLabel={submitLabel}
          busy={busy}
          error={error}
        />
        <TripPreview
          mode={draft.mode}
          when={when}
          plate={bus.plate}
          operator={staff?.operator?.name ?? ''}
          busType={shortType[bus.type] ?? BUS_TYPE_NAMES[bus.type]}
          route={routeName(route)}
          seats={bus.layout.seatCount - (existing?.sold ?? 0)}
          fare={Number(draft.fare)}
          bay={bay?.number}
        />
      </div>
      {existing && <CancelTrip trip={existing} />}
    </>
  )
}

/** Takes a trip off: held seats are released, online buyers refunded, walk-ins listed for repaying. */
function CancelTrip({ trip }: { trip: ApiAdminTrip }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ refunds: number; cash: { code: string; seatLabel: string; amountPesewas: number }[] } | null>(null)

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      const res = (await cancelTrip(trip.id, reason.trim())) as {
        refundsPending: number
        cashToRepay: { code: string; seatLabel: string; amountPesewas: number }[]
      }
      setDone({ refunds: res.refundsPending, cash: res.cashToRepay })
      // Every list, but not this trip: re-reading it now (cancelled, locked)
      // would swap this summary, and the cash to repay, for "can't be edited"
      await queryClient.invalidateQueries({ queryKey: adminKeys.all, predicate: (q) => q.queryKey[1] !== 'trip' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Card className="flex flex-col gap-3">
        <Heading as="h2" size="sm">
          Trip cancelled
        </Heading>
        <p className="m-0">
          Every passenger has been emailed. {done.refunds} online {done.refunds === 1 ? 'payment is' : 'payments are'} being refunded.
        </p>
        {done.cash.length > 0 && (
          <>
            <p className="m-0 font-semibold">Repay these cash tickets at the station:</p>
            <ul className="m-0 pl-5">
              {done.cash.map((c) => (
                <li key={c.code}>
                  <span className="font-mono">{c.code}</span> · seat {c.seatLabel} · {cedis(c.amountPesewas / 100)}
                </li>
              ))}
            </ul>
          </>
        )}
        <Button className="self-start" onClick={() => navigate('/operator/trips')}>
          Back to trips
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 border-danger">
      <Heading as="h2" size="sm">
        Cancel this trip
      </Heading>
      <p className="m-0 text-muted">
        {trip.sold ? `${trip.sold} ${trip.sold === 1 ? 'ticket has' : 'tickets have'} been sold. ` : ''}Online buyers get their money back; cash
        walk-ins are listed for you to repay. This can’t be undone.
      </p>
      {open ? (
        <>
          <FormField id="cx-reason" label="Reason (passengers see it)">
            <TextInput id="cx-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Bus broke down" />
          </FormField>
          {error && (
            <p role="alert" className="m-0 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep the trip
            </Button>
            <Button onClick={() => void cancel()} disabled={busy || reason.trim().length < 3} aria-busy={busy}>
              {busy ? 'Cancelling…' : 'Cancel the trip'}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
          Cancel trip…
        </Button>
      )}
    </Card>
  )
}
