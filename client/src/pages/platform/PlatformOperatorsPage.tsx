import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { errorMessage, isApiError } from '@/api/client'
import { createOperator, slugify, usePlatformOperators, useRefreshPlatform, type ApiPlatformOperator } from '@/api/platform'
import { Badge, Button, TextInput } from '@/components/atoms'
import { FormField, InlineFormCard, LoadState, PageHeader } from '@/components/molecules'
import { ResponsiveTable, type Column } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'

const fleet = (o: ApiPlatformOperator) =>
  `${o.counts.buses} bus${o.counts.buses === 1 ? '' : 'es'} · ${o.counts.routes} route${o.counts.routes === 1 ? '' : 's'} · ${o.counts.staff} staff`

function StatusBadge({ status }: { status: ApiPlatformOperator['status'] }) {
  return status === 'ACTIVE' ? <Badge tone="valid">Active</Badge> : <Badge tone="warning">Suspended</Badge>
}

const manage = (o: ApiPlatformOperator) => (
  <Link to={`/platform/operators/${o.id}`} className="font-semibold">
    Manage
  </Link>
)

const columns: Column<ApiPlatformOperator>[] = [
  {
    header: 'Company',
    cell: (o) => (
      <>
        <p className="m-0 font-semibold">{o.name}</p>
        <p className="m-0 font-mono text-sm text-muted">{o.slug}</p>
      </>
    ),
  },
  { header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
  { header: 'On Seatline', cell: fleet, className: 'text-muted' },
  { header: 'Contact', cell: (o) => o.email ?? o.phone ?? '—', className: 'text-muted' },
  { header: <span className="sr-only">Actions</span>, cell: manage, className: 'text-right' },
]

/** /platform: every bus company on Seatline, and adding one. */
export function PlatformOperatorsPage() {
  const operators = usePlatformOperators()
  return (
    <OperatorTemplate area="platform" title="Bus companies" context="platform">
      <AddCompany />
      {operators.data ? (
        <ResponsiveTable
          label="Bus companies"
          rows={operators.data}
          rowKey={(o) => o.id}
          columns={columns}
          card={(o) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 font-semibold">{o.name}</p>
                <StatusBadge status={o.status} />
              </div>
              <p className="m-0 text-sm text-muted">{fleet(o)}</p>
              {manage(o)}
            </div>
          )}
          empty={<p className="m-0 text-muted">No bus companies yet. Add the first one above.</p>}
          footer={`${operators.data.length} compan${operators.data.length === 1 ? 'y' : 'ies'}`}
        />
      ) : (
        <LoadState pending={operators.isPending} error={operators.error} onRetry={() => void operators.refetch()} label="Loading bus companies…" />
      )}
    </OperatorTemplate>
  )
}

/** The header and its "Add bus company" form; adding opens the company to invite its admin. */
function AddCompany() {
  const navigate = useNavigate()
  const refresh = useRefreshPlatform()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const operator = await createOperator({
        name: name.trim(),
        slug: slug || slugify(name),
        ...(phone.trim() && { phone: phone.trim() }),
        ...(email.trim() && { email: email.trim() }),
      })
      await refresh()
      navigate(`/platform/operators/${operator.id}?added=1`)
    } catch (e) {
      const fields = isApiError(e, 'VALIDATION_FAILED') ? e.fields : {}
      setError(Object.values(fields).flat()[0] ?? errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Bus companies"
        subtitle="Every operator on Seatline. Add one, then invite the person who will run it."
        action={
          <Button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full md:w-auto">
            Add bus company
          </Button>
        }
      />
      {open && (
        <InlineFormCard
          title="Add a bus company"
          label="Add bus company"
          submitLabel={busy ? 'Adding…' : 'Add company'}
          onCancel={() => setOpen(false)}
          onSubmit={() => void add()}
          note={error ? <span className="font-semibold text-danger">{error}</span> : 'Next you invite its admin, who sets up buses, routes and agents.'}
        >
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <FormField id="op-name" label="Company name">
              <TextInput
                id="op-name"
                required
                maxLength={120}
                autoComplete="off"
                placeholder="e.g. Asante Express"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slugEdited) setSlug(slugify(e.target.value))
                }}
              />
            </FormField>
            <FormField id="op-slug" label="Short name" hint="Lowercase letters, digits and dashes. It can't change later.">
              <TextInput
                id="op-slug"
                required
                mono
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setSlug(e.target.value)
                }}
              />
            </FormField>
            <FormField id="op-phone" label="Phone (optional)">
              <TextInput id="op-phone" type="tel" maxLength={20} autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FormField>
            <FormField id="op-email" label="Office email (optional)">
              <TextInput id="op-email" type="email" maxLength={254} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
          </div>
        </InlineFormCard>
      )}
    </>
  )
}
