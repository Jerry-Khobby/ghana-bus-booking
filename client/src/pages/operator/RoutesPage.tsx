import { useState } from 'react'
import { createBay, createRoute, routeName, updateFares, useBays, useRefreshAdmin, useRoutes } from '@/api/admin'
import { useStations } from '@/api/catalog'
import { errorMessage } from '@/api/client'
import { Button, Card, Dropdown, Heading, TextInput } from '@/components/atoms'
import { FormField, InlineFormCard, LoadState, PageHeader } from '@/components/molecules'
import { RoutesFaresTable } from '@/components/organisms'
import { stationName } from '@/components/organisms/SearchForm'
import { OperatorTemplate } from '@/components/templates'
import type { RouteRecord } from '@/data/types'

export function RoutesPage() {
  const routes = useRoutes()
  const refresh = useRefreshAdmin()
  const [fares, setFares] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = routes.data ?? []
  const rows: RouteRecord[] = list.map((r) => ({
    id: r.id,
    name: routeName(r),
    stations: `${r.origin.name} → ${r.destination.name}`,
    tripsToday: r.tripsToday,
    fare: r.baseFarePesewas / 100,
  }))
  const changes = Object.entries(fares)
    .filter(([id, v]) => v !== '' && !Number.isNaN(Number(v)) && Number(v) !== rows.find((r) => r.id === id)?.fare)
    .map(([routeId, v]) => ({ routeId, baseFarePesewas: Math.round(Number(v) * 100) }))
  const dirty = changes.length > 0

  async function saveFares() {
    setBusy(true)
    setError(null)
    try {
      await updateFares(changes)
      await refresh()
      setFares({})
      setSaved(true)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const saveButton = (
    <Button
      variant={saved && !dirty ? 'muted' : 'dark'}
      disabled={!dirty || busy}
      onClick={() => void saveFares()}
      className="w-full md:w-auto"
      aria-live="polite"
    >
      {busy ? 'Saving…' : saved && !dirty ? 'Fares saved' : 'Save fare changes'}
    </Button>
  )

  return (
    <OperatorTemplate title="Routes and fares" mobileAction={saveButton}>
      <AddRoute />

      {routes.data ? (
        <RoutesFaresTable
          routes={rows}
          fares={fares}
          onFareChange={(id, v) => {
            setSaved(false)
            setFares((f) => ({ ...f, [id]: v }))
          }}
        />
      ) : (
        <LoadState pending={routes.isPending} error={routes.error} onRetry={() => void routes.refetch()} label="Loading routes…" />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted">
          New fares apply to trips created after you save. <span className="lg:hidden">Sold tickets keep their price.</span>
          <span className="hidden lg:inline">Tickets already sold keep their price.</span>
        </p>
        <div className="hidden md:block">{saveButton}</div>
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <Bays />
    </OperatorTemplate>
  )
}

/** The header and its "Add route" form. */
function AddRoute() {
  const stations = useStations()
  const refresh = useRefreshAdmin()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [fare, setFare] = useState('')
  const [error, setError] = useState<string | null>(null)
  const options = (stations.data ?? []).map((s) => ({ value: s.id, label: stationName(s) }))
  const origin = from || options[0]?.value || ''
  const destination = to || options.find((o) => o.value !== origin)?.value || ''

  async function save() {
    setError(null)
    try {
      await createRoute({ originStationId: origin, destinationStationId: destination, baseFarePesewas: Math.round(Number(fare) * 100) })
      await refresh()
      setFare('')
      setOpen(false)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Routes and fares"
        subtitle={
          <>
            <span className="lg:hidden">Base fares fill in when you create a trip</span>
            <span className="hidden lg:inline">Base fares fill in automatically when you create a trip.</span>
          </>
        }
        action={
          <Button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full md:w-auto">
            Add route
          </Button>
        }
      />
      {open && (
        <InlineFormCard
          title="Add a route"
          label="Add route"
          submitLabel="Save route"
          onCancel={() => setOpen(false)}
          onSubmit={() => void save()}
          note={error ? <span className="font-semibold text-danger">{error}</span> : 'Stations come from the shared list. Ask Seatline to add a missing one.'}
        >
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <FormField id="ro-from" label="From station">
              <Dropdown id="ro-from" labelledBy="ro-from-label" value={origin} options={options} onChange={setFrom} />
            </FormField>
            <FormField id="ro-to" label="To station">
              <Dropdown id="ro-to" labelledBy="ro-to-label" value={destination} options={options} onChange={setTo} />
            </FormField>
            <FormField id="ro-fare" label="Base fare (GH¢)">
              <TextInput id="ro-fare" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={fare} onChange={(e) => setFare(e.target.value)} />
            </FormField>
          </div>
        </InlineFormCard>
      )}
    </>
  )
}

/** Boarding bays at each station: trips load at one, agents work some. */
function Bays() {
  const bays = useBays()
  const stations = useStations()
  const refresh = useRefreshAdmin()
  const [stationId, setStationId] = useState('')
  const [number, setNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const options = (stations.data ?? []).map((s) => ({ value: s.id, label: stationName(s) }))
  const station = stationId || options[0]?.value || ''

  const byStation = new Map<string, { name: string; numbers: number[] }>()
  for (const bay of bays.data ?? []) {
    const entry = byStation.get(bay.station.id) ?? { name: stationName(bay.station), numbers: [] }
    entry.numbers.push(bay.number)
    byStation.set(bay.station.id, entry)
  }

  async function add() {
    setError(null)
    try {
      await createBay({ stationId: station, number: Number(number) })
      await refresh()
      setNumber('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <Heading as="h2" size="sm">
        Bays
      </Heading>
      {byStation.size ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {[...byStation.values()].map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> · bays {s.numbers.sort((a, b) => a - b).join(', ')}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-muted">No bays yet. Trips need a bay at their starting station.</p>
      )}
      <form
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <div className="md:w-72">
          <FormField id="bay-station" label="Station">
            <Dropdown id="bay-station" labelledBy="bay-station-label" value={station} options={options} onChange={setStationId} />
          </FormField>
        </div>
        <div className="md:w-32">
          <FormField id="bay-number" label="Bay number">
            <TextInput id="bay-number" required inputMode="numeric" pattern="[0-9]{1,3}" value={number} onChange={(e) => setNumber(e.target.value)} />
          </FormField>
        </div>
        <Button type="submit" variant="outline">
          Add bay
        </Button>
      </form>
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </Card>
  )
}
