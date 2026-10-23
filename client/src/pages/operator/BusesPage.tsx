import { useState } from 'react'
import { Link } from 'react-router'
import { useOperator } from '@/app/OperatorContext'
import { Button, Dropdown, TextInput } from '@/components/atoms'
import { FormField, InlineFormCard, PageHeader } from '@/components/molecules'
import { BusesTable } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { busTypes } from '@/data/mock'
import type { BusType } from '@/data/types'
import { buildRows } from '@/lib/seats'

export function BusesPage() {
  const { buses, layouts, addBus } = useOperator()
  const [open, setOpen] = useState(false)
  const [plate, setPlate] = useState('')
  const [type, setType] = useState<BusType>('Air-conditioned coach')
  const [layoutId, setLayoutId] = useState(layouts[0].id)
  const active = buses.filter((b) => b.status === 'active').length

  function save() {
    addBus({ plate: plate.trim().toUpperCase(), type, layoutId, status: 'active', next: 'No trips yet' })
    setPlate('')
    setOpen(false)
  }

  return (
    <OperatorTemplate title="Buses">
      <PageHeader
        title="Buses"
        subtitle={`${buses.length} buses in the fleet · ${active} active`}
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
          submitLabel="Save bus"
          onCancel={() => setOpen(false)}
          onSubmit={save}
          note={
            <>
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
                <Dropdown
                  id="bu-layout"
                  labelledBy="bu-layout-label"
                  value={layoutId}
                  options={layouts.map((l) => ({ value: l.id, label: `${l.name} · ${buildRows(l.layout).total}` }))}
                  onChange={setLayoutId}
                />
              </FormField>
            </div>
          </div>
        </InlineFormCard>
      )}

      <BusesTable buses={buses} layouts={layouts} />
    </OperatorTemplate>
  )
}
