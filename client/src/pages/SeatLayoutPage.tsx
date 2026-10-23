import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useOperator } from '@/app/OperatorContext'
import { PageHeader } from '@/components/molecules'
import { LayoutActions, LayoutPreview, LayoutSettings } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { defaultLayout } from '@/lib/seats'
import { NotFoundPage } from './NotFoundPage'

/** Edit a layout at /operator/layouts/:layoutId, or create one at /operator/layouts/new. */
export function SeatLayoutPage() {
  const { layoutId } = useParams()
  // Remount per layout so the form starts from that layout's values.
  return <LayoutEditor key={layoutId} layoutId={layoutId} />
}

function LayoutEditor({ layoutId }: { layoutId: string | undefined }) {
  const navigate = useNavigate()
  const { layouts, saveLayout } = useOperator()
  const isNew = layoutId === 'new'
  const existing = layouts.find((l) => l.id === layoutId)
  const [name, setName] = useState(existing?.name ?? (isNew ? '' : 'AC coach — standard'))
  const [layout, setLayout] = useState(existing?.layout ?? defaultLayout)

  if (!isNew && !existing) return <NotFoundPage title="We could not find that layout" body="It may have been renamed. Pick one from Seat layouts." />

  const title = isNew ? 'New layout' : 'Edit layout'

  function save() {
    const id = existing?.id ?? `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`
    saveLayout({ id, name: name.trim(), layout })
    navigate('/operator/layouts')
  }

  return (
    <OperatorTemplate title={title} back={{ to: '/operator/layouts', label: 'Back to seat layouts' }} mobileAction={<LayoutActions />}>
      <div className="hidden md:block">
        <PageHeader back={{ to: '/operator/layouts', label: 'Seat layouts' }} title={title} />
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-[18px] lg:gap-6">
        <LayoutSettings name={name} onNameChange={setName} layout={layout} onChange={setLayout} onSave={save} />
        <LayoutPreview layout={layout} />
      </div>
    </OperatorTemplate>
  )
}
