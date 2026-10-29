import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { createLayout, saveLayout, useLayout, useRefreshAdmin, type ApiLayout } from '@/api/admin'
import { errorMessage, isApiError } from '@/api/client'
import { Card } from '@/components/atoms'
import { LoadState, PageHeader } from '@/components/molecules'
import { LayoutActions, LayoutPreview, LayoutSettings } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { defaultLayout, fromCells, toCells } from '@/lib/seats'
import { NotFoundPage } from './NotFoundPage'

/** Edit a layout at /operator/layouts/:layoutId, or create one at /operator/layouts/new. */
export function SeatLayoutPage() {
  const { layoutId } = useParams()
  const isNew = layoutId === 'new'
  const title = isNew ? 'New layout' : 'Edit layout'
  return (
    <OperatorTemplate title={title} back={{ to: '/operator/layouts', label: 'Back to seat layouts' }} mobileAction={<LayoutActions />}>
      <div className="hidden md:block">
        <PageHeader back={{ to: '/operator/layouts', label: 'Seat layouts' }} title={title} />
      </div>
      {isNew ? <LayoutEditor key="new" /> : <ExistingLayout key={layoutId} id={layoutId!} />}
    </OperatorTemplate>
  )
}

function ExistingLayout({ id }: { id: string }) {
  const layout = useLayout(id)
  if (isApiError(layout.error, 'NOT_FOUND')) {
    return <NotFoundPage title="We could not find that layout" body="It may have been archived. Pick one from Seat layouts." />
  }
  if (!layout.data) {
    return <LoadState pending={layout.isPending} error={layout.error} onRetry={() => void layout.refetch()} label="Loading the layout…" />
  }
  return <LayoutEditor existing={layout.data} />
}

function LayoutEditor({ existing }: { existing?: ApiLayout }) {
  const navigate = useNavigate()
  const refresh = useRefreshAdmin()
  const shape = existing ? fromCells(existing.rows, existing.cols, existing.cells) : defaultLayout
  const [name, setName] = useState(existing?.name ?? '')
  const [layout, setLayout] = useState(shape ?? defaultLayout)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const body = { name: name.trim(), ...toCells(layout) }
      if (existing) await saveLayout(existing.id, body)
      else await createLayout(body)
      await refresh()
      navigate('/operator/layouts')
    } catch (e) {
      const problems = isApiError(e, 'VALIDATION_FAILED') ? e.fields.cells : undefined
      setError(problems?.length ? problems.join('. ') : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {existing && !shape && (
        <Card>
          <p className="m-0">
            This layout wasn’t drawn with these settings. Saving replaces it with the plan shown here; buses using it keep their old plan
            on trips already published.
          </p>
        </Card>
      )}
      {existing && existing.busesUsing > 0 && (
        <p className="m-0 text-sm text-muted">
          Used by {existing.busesUsing} bus{existing.busesUsing === 1 ? '' : 'es'}. Trips already published keep the seats they were sold with.
        </p>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-[18px] lg:gap-6">
        <LayoutSettings name={name} onNameChange={setName} layout={layout} onChange={setLayout} onSave={() => void save()} busy={busy} error={error} />
        <LayoutPreview layout={layout} />
      </div>
    </>
  )
}
