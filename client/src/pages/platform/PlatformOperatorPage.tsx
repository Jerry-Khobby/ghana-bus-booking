import { useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { errorMessage } from '@/api/client'
import {
  inviteOperatorAdmin,
  sendAdminLink,
  updateOperator,
  useOperatorAdmins,
  usePlatformOperators,
  useRefreshPlatform,
  type ApiOperatorAdmin,
  type ApiPlatformOperator,
} from '@/api/platform'
import { Badge, Button, ButtonLink, Card, Heading, TextInput } from '@/components/atoms'
import { FormField, LoadState, PageHeader } from '@/components/molecules'
import { OperatorTemplate } from '@/components/templates'

/** /platform/operators/:id: one bus company, its settings and its admins. */
export function PlatformOperatorPage() {
  const { operatorId = '' } = useParams()
  const operators = usePlatformOperators()
  const operator = operators.data?.find((o) => o.id === operatorId)

  return (
    <OperatorTemplate area="platform" title={operator?.name ?? 'Bus company'} back={{ to: '/platform', label: 'Back to bus companies' }}>
      {operator ? (
        <Company key={operator.id} operator={operator} />
      ) : operators.data ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="m-0 font-semibold">We could not find that bus company.</p>
          <ButtonLink to="/platform" variant="outline">
            Bus companies
          </ButtonLink>
        </Card>
      ) : (
        <LoadState pending={operators.isPending} error={operators.error} onRetry={() => void operators.refetch()} label="Loading the company…" />
      )}
    </OperatorTemplate>
  )
}

function Company({ operator }: { operator: ApiPlatformOperator }) {
  const added = useSearchParams()[0].has('added')
  return (
    <>
      <PageHeader
        back={{ to: '/platform', label: 'Bus companies' }}
        backFromTablet
        title={operator.name}
        subtitle={<span className="font-mono">{operator.slug}</span>}
        action={operator.status === 'ACTIVE' ? <Badge tone="valid">Active</Badge> : <Badge tone="warning">Suspended</Badge>}
      />
      {added && (
        <p role="status" className="m-0 rounded-xl bg-brand-tint px-4 py-3 text-sm text-brand-ink">
          {operator.name} is on Seatline. Invite its admin below: they set a password from the email, then add buses, routes and agents.
        </p>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Admins operator={operator} />
        </div>
        <div className="flex flex-col gap-4 lg:w-[380px]">
          <Details operator={operator} />
          <Suspend operator={operator} />
        </div>
      </div>
    </>
  )
}

const statusLabel: Record<ApiOperatorAdmin['status'], string> = { INVITED: 'Invited', ACTIVE: 'Active', DISABLED: 'Disabled' }

/** Who runs the company, inviting them, and new links for anyone locked out. */
function Admins({ operator }: { operator: ApiPlatformOperator }) {
  const admins = useOperatorAdmins(operator.id)
  const refresh = useRefreshPlatform()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(key: string, work: () => Promise<string>) {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      setNotice(await work())
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  function invite(e: FormEvent) {
    e.preventDefault()
    void run('invite', async () => {
      const admin = await inviteOperatorAdmin(operator.id, { name: name.trim(), email: email.trim() })
      setName('')
      setEmail('')
      return `Invite sent to ${admin.email}. The link works for 7 days.`
    })
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <Heading as="h2" size="sm">
          Admins
        </Heading>
        <p className="m-0 mt-1 text-sm text-muted">They run the company on Seatline: buses, routes, trips, agents and reports.</p>
      </div>

      {!admins.data ? (
        <LoadState pending={admins.isPending} error={admins.error} onRetry={() => void admins.refetch()} label="Loading admins…" />
      ) : admins.data.length === 0 ? (
        <p className="m-0 rounded-[10px] bg-canvas px-3.5 py-3 text-[15px]">No admin yet. Invite the first one below.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0" aria-label="Admins">
          {admins.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-sunken py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="m-0 font-semibold">
                  {a.name} <Badge tone={a.status === 'ACTIVE' ? 'valid' : a.status === 'INVITED' ? 'warning' : 'departed'} size="sm">{statusLabel[a.status]}</Badge>
                </p>
                <p className="m-0 truncate text-sm text-muted">{a.email}</p>
              </div>
              {a.status !== 'DISABLED' && (
                <Button
                  variant="outline"
                  disabled={busy === a.id}
                  onClick={() =>
                    void run(a.id, async () => {
                      const { sent } = await sendAdminLink(a.id)
                      return sent === 'INVITE' ? `A new invite went to ${a.email}.` : `A password reset link went to ${a.email}. It works for an hour.`
                    })
                  }
                >
                  {busy === a.id ? 'Sending…' : a.status === 'INVITED' ? 'Resend invite' : 'Send reset link'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form aria-label="Invite admin" onSubmit={invite} className="flex flex-col gap-3.5 border-t border-line pt-4">
        <p className="m-0 font-semibold">Invite an admin</p>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <FormField id="ad-name" label="Full name">
            <TextInput id="ad-name" required maxLength={120} autoComplete="off" placeholder="e.g. Kwame Mensah" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="ad-email" label="Work email">
            <TextInput id="ad-email" type="email" required maxLength={254} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
        </div>
        <Button type="submit" className="self-start" disabled={busy === 'invite'} aria-busy={busy === 'invite'}>
          {busy === 'invite' ? 'Sending…' : 'Send invite'}
        </Button>
      </form>

      {notice && (
        <p role="status" className="m-0 rounded-xl bg-brand-tint px-4 py-3 text-sm text-brand-ink">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </Card>
  )
}

/** Name, contact, the booking fee and how long seats are held. */
function Details({ operator }: { operator: ApiPlatformOperator }) {
  const refresh = useRefreshPlatform()
  const [name, setName] = useState(operator.name)
  const [phone, setPhone] = useState(operator.phone ?? '')
  const [email, setEmail] = useState(operator.email ?? '')
  const [fee, setFee] = useState(String(operator.serviceFeePesewas / 100))
  const [hold, setHold] = useState(String(operator.holdMinutes))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await updateOperator(operator.id, {
        name: name.trim(),
        ...(phone.trim() && { phone: phone.trim() }),
        ...(email.trim() && { email: email.trim() }),
        serviceFeePesewas: Math.round(Number(fee) * 100),
        holdMinutes: Number(hold),
      })
      await refresh()
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form aria-label="Company details" onSubmit={save} className="flex flex-col gap-3.5">
        <Heading as="h2" size="sm">
          Details
        </Heading>
        <FormField id="cd-name" label="Company name">
          <TextInput id="cd-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField id="cd-phone" label="Phone">
          <TextInput id="cd-phone" type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
        <FormField id="cd-email" label="Office email">
          <TextInput id="cd-email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3.5">
          <FormField id="cd-fee" label="Booking fee (GH¢)" hint="Added to each online seat">
            <TextInput id="cd-fee" type="number" required min={0} max={1000} step={0.01} value={fee} onChange={(e) => setFee(e.target.value)} />
          </FormField>
          <FormField id="cd-hold" label="Seat hold (min)" hint="Time to pay before a seat is released">
            <TextInput id="cd-hold" type="number" required min={1} max={30} step={1} value={hold} onChange={(e) => setHold(e.target.value)} />
          </FormField>
        </div>
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'm-0 text-sm text-brand-ink' : 'm-0 text-sm font-semibold text-danger'}>
            {message.text}
          </p>
        )}
        <Button type="submit" variant="outline" className="self-start" disabled={busy}>
          {busy ? 'Saving…' : 'Save details'}
        </Button>
      </form>
    </Card>
  )
}

/** Suspended companies vanish from search; their staff and data stay. */
function Suspend({ operator }: { operator: ApiPlatformOperator }) {
  const refresh = useRefreshPlatform()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = operator.status === 'ACTIVE'

  async function change() {
    setBusy(true)
    setError(null)
    try {
      await updateOperator(operator.id, { status: active ? 'SUSPENDED' : 'ACTIVE' })
      await refresh()
      setConfirming(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className={active ? 'flex flex-col gap-3 border-danger' : 'flex flex-col gap-3'}>
      <Heading as="h2" size="sm">
        {active ? 'Suspend this company' : 'Suspended'}
      </Heading>
      <p className="m-0 text-sm text-muted">
        {active
          ? 'Its buses disappear from search and nobody can book them online. Its staff, trips and sales stay, ready for when you reactivate it.'
          : 'Passengers can’t find or book its buses. Reactivate it to put them back in search.'}
      </p>
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      {active && !confirming ? (
        <Button variant="outline" className="self-start" onClick={() => setConfirming(true)}>
          Suspend…
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {active && (
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it active
            </Button>
          )}
          <Button onClick={() => void change()} disabled={busy} aria-busy={busy}>
            {busy ? 'Saving…' : active ? `Suspend ${operator.name}` : 'Reactivate'}
          </Button>
        </div>
      )}
    </Card>
  )
}
