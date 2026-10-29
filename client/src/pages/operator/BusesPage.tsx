import { useState } from 'react'
import { Link } from 'react-router'
import { API_BUS_TYPE, BUS_TYPE_NAMES, busNext, busStatusOf, createBus, useBuses, useLayouts, useRefreshAdmin } from '@/api/admin'
import { errorMessage, isApiError } from '@/api/client'
import { Button, Dropdown, TextInput } from '@/components/atoms'
import { FormField, InlineFormCard, LoadState, PageHeader } from '@/components/molecules'
import { BusesTable, type BusRow } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { busTypes, type BusType } from '@/data/types'

export function BusesPage() {
  return (
    <OperatorTemplate title="Buses" context="fleet">
      <Buses />
    </OperatorTemplate>
  )
}

function Buses() {
  const buses = useBuses()
  const layouts = useLayouts()
  const refresh = useRefreshAdmin()
  const [open, setOpen] = useState(false)
  const [plate, setPlate] = useState('')
  const [type, setType] = useState<BusType>('Air-conditioned coach')
  const [layoutId, setLayoutId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = buses.data ?? []
  const layoutList = layouts.data ?? []
  const chosenLayout = layoutId ?? layoutList[0]?.id ?? ''
  const rows: BusRow[] = list.map((b) => ({
    id: b.id,
    plate: b.plate,
    type: BUS_TYPE_NAMES[b.type],
    layoutId: b.layout.id,
    layoutLabel: `${b.layout.name} · ${b.layout.seatCount}`,
    status: busStatusOf(b.status),
    next: busNext(b),
  }))
  const active = list.filter((b) => b.status === 'ACTIVE').length

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await createBus({ plate: plate.trim().toUpperCase().replace(/\s+/g, ' '), type: API_BUS_TYPE[type], layoutId: chosenLayout })
      await refresh()
      setPlate('')
      setOpen(false)
    } catch (e) {
      setError(isApiError(e, 'VALIDATION_FAILED') && e.fields.plate ? 'Enter a plate like GR 1234-26' : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Buses"
        subtitle={
          <>
            {list.length} buses<span className="hidden lg:inline"> in the fleet</span> · {active} active
          </>
        }
        action={
          <Button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full md:w-auto">
            Add bus
          </Button>
        }
      />

      {open && (
        <InlineFormCard
          title="Add a bus"
          label="Add bus"
          submitLabel={busy ? 'Saving…' : 'Save bus'}
          onCancel={() => setOpen(false)}
          onSubmit={() => void save()}
          note={
            <>
              {error && (
                <span role="alert" className="mb-1 block font-semibold text-danger">
                  {error}
                </span>
              )}
              Need a different seat plan?{' '}
              <Link to="/operator/layouts/new" className="font-semibold">
                Create a new layout
              </Link>{' '}
              first.
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3">
            <FormField id="bu-plate" label="Number plate">
              <TextInput
                id="bu-plate"
                required
                autoComplete="off"
                placeholder="GR 0000-26"
                pattern="[A-Za-z]{2} ?\d{3,4}-\d{2}"
                title="Like GR 1234-26"
                className="font-mono uppercase"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
              />
            </FormField>
            <FormField id="bu-type" label="Bus type">
              <Dropdown id="bu-type" labelledBy="bu-type-label" value={type} options={busTypes.map((t) => ({ value: t, label: t }))} onChange={setType} />
            </FormField>
            <div className="col-span-2 md:col-span-1">
              <FormField id="bu-layout" label="Seat layout">
                {layoutList.length ? (
                  <Dropdown
                    id="bu-layout"
                    labelledBy="bu-layout-label"
                    value={chosenLayout}
                    options={layoutList.map((l) => ({ value: l.id, label: `${l.name} · ${l.seatCount}` }))}
                    onChange={setLayoutId}
                  />
                ) : (
                  <p className="m-0 text-sm text-muted">Create a seat layout first.</p>
                )}
              </FormField>
            </div>
          </div>
        </InlineFormCard>
      )}

      {buses.data ? (
        <BusesTable buses={rows} />
      ) : (
        <LoadState pending={buses.isPending} error={buses.error} onRetry={() => void buses.refetch()} label="Loading the fleet…" />
      )}
    </>
  )
}
