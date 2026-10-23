import { useState } from 'react'
import { useOperator } from '@/app/OperatorContext'
import { Button, TextInput } from '@/components/atoms'
import { FormField, InlineFormCard, PageHeader } from '@/components/molecules'
import { RoutesFaresTable } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'

const emptyRoute = { from: '', to: '', fare: '' }

/** "Accra — Circle" → { city: "Accra", station: "Circle" } */
function splitStation(value: string) {
  const [city, station] = value.split('—').map((s) => s.trim())
  return { city, station: station || `${city} main` }
}

export function RoutesPage() {
  const { routes, addRoute, setRouteFares } = useOperator()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(emptyRoute)
  const [fares, setFares] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const dirty = Object.entries(fares).some(([id, v]) => Number(v) !== routes.find((r) => r.id === id)?.fare)

  function saveRoute() {
    const from = splitStation(draft.from)
    const to = splitStation(draft.to)
    addRoute({
      id: `${from.city}-${to.city}-${Date.now().toString(36)}`.toLowerCase().replace(/\s+/g, '-'),
      name: `${from.city} → ${to.city}`,
      stations: `${from.station} → ${to.station}`,
      tripsToday: 0,
      fare: Number(draft.fare),
    })
    setDraft(emptyRoute)
    setOpen(false)
  }

  function saveFares() {
    const parsed = Object.fromEntries(Object.entries(fares).filter(([, v]) => v !== '' && !Number.isNaN(Number(v))).map(([id, v]) => [id, Number(v)]))
    setRouteFares(parsed)
    setFares({})
    setSaved(true)
  }

  const saveButton = (
    <Button variant={saved && !dirty ? 'muted' : 'dark'} disabled={!dirty} onClick={saveFares} className="w-full md:w-auto" aria-live="polite">
      {saved && !dirty ? 'Fares saved' : 'Save fare changes'}
    </Button>
  )

  return (
    <OperatorTemplate title="Routes and fares" mobileAction={saveButton}>
      <PageHeader
        title="Routes and fares"
        subtitle="Base fares fill in automatically when you create a trip."
        action={
          <Button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full md:w-auto">
            Add route
          </Button>
        }
      />

      {open && (
        <InlineFormCard title="Add a route" label="Add route" submitLabel="Save route" onCancel={() => setOpen(false)} onSubmit={saveRoute}>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <FormField id="ro-from" label="From station">
              <TextInput id="ro-from" required placeholder="Accra — Circle" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            </FormField>
            <FormField id="ro-to" label="To station">
              <TextInput id="ro-to" required placeholder="Ho — main station" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </FormField>
            <FormField id="ro-fare" label="Base fare (GH¢)">
              <TextInput id="ro-fare" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={draft.fare} onChange={(e) => setDraft({ ...draft, fare: e.target.value })} />
            </FormField>
          </div>
        </InlineFormCard>
      )}

      <RoutesFaresTable
        routes={routes}
        fares={fares}
        onFareChange={(id, v) => {
          setSaved(false)
          setFares((f) => ({ ...f, [id]: v }))
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted">New fares apply to trips created after you save. Tickets already sold keep their price.</p>
        <div className="hidden md:block">{saveButton}</div>
      </div>
    </OperatorTemplate>
  )
}
