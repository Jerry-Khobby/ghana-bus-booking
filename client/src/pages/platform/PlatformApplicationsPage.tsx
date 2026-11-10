import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { errorMessage, isApiError } from '@/api/client'
import {
  approveApplication,
  declineApplication,
  slugify,
  useApplications,
  useRefreshPlatform,
  type ApiApplication,
  type ApplicationStatus,
} from '@/api/platform'
import { Button, Card, TextInput } from '@/components/atoms'
import { FormField, LoadState, PageHeader, SegmentedControl } from '@/components/molecules'
import { OperatorTemplate } from '@/components/templates'

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' })

const tabs: { value: ApplicationStatus; label: string }[] = [
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DECLINED', label: 'Declined' },
]

/** /platform/applications: bus companies that asked to join from /join. */
export function PlatformApplicationsPage() {
  const [status, setStatus] = useState<ApplicationStatus>('PENDING')
  const applications = useApplications(status)
  // Above the list: a reviewed application leaves the Waiting tab at once
  const [notice, setNotice] = useState<ReactNode>(null)

  return (
    <OperatorTemplate area="platform" title="Applications" context="platform">
      <PageHeader title="Applications" subtitle="Bus companies that asked to join from the Join Seatline page." />
      <div className="max-w-[420px]">
        <SegmentedControl label="Show" value={status} onChange={setStatus} options={tabs} />
      </div>
      {notice && (
        <p role="status" className="m-0 rounded-xl bg-brand-tint px-4 py-3 text-sm text-brand-ink">
          {notice}
        </p>
      )}
      {!applications.data ? (
        <LoadState pending={applications.isPending} error={applications.error} onRetry={() => void applications.refetch()} label="Loading applications…" />
      ) : applications.data.length === 0 ? (
        <Card>
          <p className="m-0 text-muted">
            {status === 'PENDING' ? 'Nothing waiting. New applications from /join land here, and you get an email.' : 'None yet.'}
          </p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Applications">
          {applications.data.map((a) => (
            <li key={a.id}>
              <Application application={a} onReviewed={setNotice} />
            </li>
          ))}
        </ul>
      )}
    </OperatorTemplate>
  )
}

function Application({ application: a, onReviewed }: { application: ApiApplication; onReviewed: (notice: ReactNode) => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="m-0 font-display text-lg font-bold">{a.companyName}</p>
        <p className="m-0 text-sm text-muted">Applied {when(a.createdAt)}</p>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">Contact</dt>
        <dd className="m-0">
          {a.contactName} · <a href={`mailto:${a.email}`}>{a.email}</a> · {a.phone}
        </dd>
        <dt className="text-muted">Loads in</dt>
        <dd className="m-0">
          {a.city}
          {a.fleetSize ? ` · ${a.fleetSize} bus${a.fleetSize === 1 ? '' : 'es'}` : ''}
        </dd>
        {a.message && (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="m-0 whitespace-pre-line">{a.message}</dd>
          </>
        )}
      </dl>
      {a.status === 'PENDING' && <Review application={a} onReviewed={onReviewed} />}
      {a.status === 'APPROVED' && a.operator && (
        <p className="m-0 text-sm">
          Approved {a.reviewedAt && when(a.reviewedAt)} as <Link to={`/platform/operators/${a.operator.id}`}>{a.operator.name}</Link>.
        </p>
      )}
      {a.status === 'DECLINED' && (
        <p className="m-0 text-sm text-muted">
          Declined {a.reviewedAt && when(a.reviewedAt)}
          {a.declineReason ? `: ${a.declineReason}` : '.'}
        </p>
      )}
    </Card>
  )
}

/** Approve (the company, and an invite to its contact) or decline (with an optional reason). */
function Review({ application: a, onReviewed }: { application: ApiApplication; onReviewed: (notice: ReactNode) => void }) {
  const refresh = useRefreshPlatform()
  const [mode, setMode] = useState<'approve' | 'decline' | null>(null)
  const [slug, setSlug] = useState(() => slugify(a.companyName))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      const fields = isApiError(e, 'VALIDATION_FAILED') ? e.fields : {}
      setError(Object.values(fields).flat()[0] ?? errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {mode === 'approve' && (
        <form
          aria-label={`Approve ${a.companyName}`}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              const { operator } = await approveApplication(a.id, slug)
              onReviewed(
                <>
                  {operator.name} is on Seatline, and {a.contactName} has an invite at {a.email}.{' '}
                  <Link to={`/platform/operators/${operator.id}`}>Open the company</Link>
                </>,
              )
              await refresh()
            })
          }}
        >
          <FormField id={`ap-slug-${a.id}`} label="Short name" hint="Lowercase letters, digits and dashes. It can't change later.">
            <TextInput id={`ap-slug-${a.id}`} required mono maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </FormField>
          <p className="m-0 text-sm text-muted">
            This adds {a.companyName} and emails {a.contactName} an invite to set a password and run it.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Approving…' : 'Approve and invite'}
            </Button>
            <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>
              Back
            </Button>
          </div>
        </form>
      )}
      {mode === 'decline' && (
        <form
          aria-label={`Decline ${a.companyName}`}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              await declineApplication(a.id, reason.trim() || undefined)
              onReviewed(`${a.companyName} declined. We emailed ${a.email}${reason.trim() ? ' with your reason' : ''}.`)
              await refresh()
            })
          }}
        >
          <FormField id={`dc-reason-${a.id}`} label="Reason (optional, we email it to them)">
            <TextInput id={`dc-reason-${a.id}`} maxLength={500} placeholder="e.g. We only cover routes out of Accra for now" value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" variant="outline" disabled={busy} aria-busy={busy}>
              {busy ? 'Declining…' : 'Decline application'}
            </Button>
            <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>
              Back
            </Button>
          </div>
        </form>
      )}
      {!mode && (
        <div className="flex flex-wrap gap-2.5">
          <Button onClick={() => setMode('approve')}>Approve…</Button>
          <Button variant="outline" onClick={() => setMode('decline')}>
            Decline…
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
