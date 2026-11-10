import { useState } from 'react'
import { errorMessage, isApiError } from '@/api/client'
import { createStation, updateStation, usePlatformStations, useRefreshPlatform, type ApiPlatformStation } from '@/api/platform'
import { Badge, Button, TextInput } from '@/components/atoms'
import { FormField, InlineFormCard, LoadState, PageHeader } from '@/components/molecules'
import { ResponsiveTable, type Column } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'

/** /platform/stations: the terminals every bus company picks its bays and routes from. */
export function PlatformStationsPage() {
  const stations = usePlatformStations()
  const refresh = useRefreshPlatform()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(s: ApiPlatformStation) {
    setBusy(s.id)
    setError(null)
    try {
      await updateStation(s.id, { active: !s.active })
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const action = (s: ApiPlatformStation) => (
    <Button variant="outline" disabled={busy === s.id} onClick={() => void toggle(s)}>
      {busy === s.id ? 'Saving…' : s.active ? 'Deactivate' : 'Activate'}
    </Button>
  )
  const status = (s: ApiPlatformStation) => (s.active ? <Badge tone="valid">Active</Badge> : <Badge tone="departed">Inactive</Badge>)
  const columns: Column<ApiPlatformStation>[] = [
    { header: 'City', cell: (s) => <span className="font-semibold">{s.city}</span> },
    { header: 'Station', cell: (s) => s.name },
    { header: 'Region', cell: (s) => s.region, className: 'text-muted' },
    { header: 'Status', cell: status },
    { header: <span className="sr-only">Actions</span>, cell: action, className: 'text-right' },
  ]

  return (
    <OperatorTemplate area="platform" title="Stations" context="platform">
      <AddStation />
      {error && (
        <p role="alert" className="m-0 rounded-xl border border-danger px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      {stations.data ? (
        <ResponsiveTable
          label="Stations"
          rows={stations.data}
          rowKey={(s) => s.id}
          columns={columns}
          card={(s) => (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="m-0 font-semibold">
                  {s.city} · {s.name}
                </p>
                <p className="m-0 text-sm text-muted">{s.region}</p>
              </div>
              <div className="flex items-center gap-2">
                {status(s)}
                {action(s)}
              </div>
            </div>
          )}
          empty={<p className="m-0 text-muted">No stations yet.</p>}
          footer={`${stations.data.length} station${stations.data.length === 1 ? '' : 's'}`}
        />
      ) : (
        <LoadState pending={stations.isPending} error={stations.error} onRetry={() => void stations.refetch()} label="Loading stations…" />
      )}
    </OperatorTemplate>
  )
}

function AddStation() {
  const refresh = useRefreshPlatform()
  const [open, setOpen] = useState(false)
  const [city, setCity] = useState('')
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  async function add() {
    setError(null)
    try {
      const station = await createStation({ city: city.trim(), name: name.trim(), region: region.trim() })
      await refresh()
      setAdded(`${station.city} (${station.name})`)
      setCity('')
      setName('')
      setRegion('')
      setOpen(false)
    } catch (e) {
      const fields = isApiError(e, 'VALIDATION_FAILED') ? e.fields : {}
      setError(Object.values(fields).flat()[0] ?? errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Stations"
        subtitle="Terminals bus companies load at and drive between. Inactive ones are hidden from search."
        action={
          <Button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full md:w-auto">
            Add station
          </Button>
        }
      />
      {added && !open && (
        <p role="status" className="m-0 rounded-xl bg-brand-tint px-4 py-3 text-sm text-brand-ink">
          {added} added. Bus companies can now add bays and routes there.
        </p>
      )}
      {open && (
        <InlineFormCard
          title="Add a station"
          label="Add station"
          submitLabel="Add station"
          onCancel={() => setOpen(false)}
          onSubmit={() => void add()}
          note={error ? <span className="font-semibold text-danger">{error}</span> : undefined}
        >
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <FormField id="st-city" label="City">
              <TextInput id="st-city" required maxLength={80} autoComplete="off" placeholder="e.g. Ho" value={city} onChange={(e) => setCity(e.target.value)} />
            </FormField>
            <FormField id="st-name" label="Station name">
              <TextInput id="st-name" required maxLength={80} autoComplete="off" placeholder="e.g. Main station" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField id="st-region" label="Region">
              <TextInput id="st-region" required maxLength={80} autoComplete="off" placeholder="e.g. Volta" value={region} onChange={(e) => setRegion(e.target.value)} />
            </FormField>
          </div>
        </InlineFormCard>
      )}
    </>
  )
}
