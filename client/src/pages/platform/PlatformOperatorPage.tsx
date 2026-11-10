import { useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { errorMessage } from '@/api/client'
import {
  deleteOperator,
  inviteOperatorAdmin,
  sendAdminLink,
  suspendOperator,
  updateOperator,
  useOperatorAdmins,
  useOperatorImpact,
  usePlatformOperators,
  useRefreshPlatform,
  type ApiOperatorAdmin,
  type ApiPlatformOperator,
  type ApiSuspendResult,
} from '@/api/platform'
import { Badge, Button, ButtonLink, Card, Checkbox, Heading, TextInput } from '@/components/atoms'
import { FormField, LoadState, PageHeader } from '@/components/molecules'
import { OperatorTemplate } from '@/components/templates'
import { cedis } from '@/lib/format'

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
          <Removal operator={operator} />
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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Taking a company off Seatline. Suspending is the normal way: it stops
 * everything but keeps the records, and can cancel its upcoming trips. Only
 * a company that never sold a seat can be deleted outright.
 */
function Removal({ operator }: { operator: ApiPlatformOperator }) {
  const impact = useOperatorImpact(operator.id)
  const [done, setDone] = useState<ApiSuspendResult | null>(null)
  const active = operator.status === 'ACTIVE'

  return (
    <Card className="flex flex-col gap-4">
      {!impact.data ? (
        <LoadState pending={impact.isPending} error={impact.error} onRetry={() => void impact.refetch()} label="Loading what it would affect…" />
      ) : (
        <>
          {active ? (
            <SuspendForm
              operator={operator}
              upcomingTrips={impact.data.upcomingTrips}
              tickets={impact.data.ticketsOnUpcomingTrips}
              staff={impact.data.staff}
              onDone={setDone}
            />
          ) : (
            <Reactivate operator={operator} done={done} onReactivated={() => setDone(null)} />
          )}
          <DeleteForm operator={operator} deletable={impact.data.deletable} bookings={impact.data.bookings} />
        </>
      )}
    </Card>
  )
}

function SuspendForm({
  operator,
  upcomingTrips,
  tickets,
  staff,
  onDone,
}: {
  operator: ApiPlatformOperator
  upcomingTrips: number
  tickets: number
  staff: number
  onDone: (result: ApiSuspendResult) => void
}) {
  const refresh = useRefreshPlatform()
  const [open, setOpen] = useState(false)
  const [cancelTrips, setCancelTrips] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function suspend(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await suspendOperator(operator.id, { cancelTrips, ...(cancelTrips && reason.trim() && { reason: reason.trim() }) })
      onDone(result)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Heading as="h2" size="sm">
        Suspend this company
      </Heading>
      <p className="m-0 text-sm text-muted">
        Its buses leave search, every sale stops, and {staff === 0 ? 'its staff are' : `its ${plural(staff, 'staff account')} ${staff === 1 ? 'is' : 'are'}`} signed
        out. Its records stay, and you can reactivate it any time.
      </p>
      {!open ? (
        <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
          Suspend…
        </Button>
      ) : (
        <form aria-label={`Suspend ${operator.name}`} onSubmit={suspend} className="flex flex-col gap-3 rounded-xl bg-canvas p-3.5">
          {upcomingTrips > 0 ? (
            <>
              <label htmlFor="sp-cancel" className="flex cursor-pointer items-start gap-2.5">
                <Checkbox id="sp-cancel" className="mt-0.5" checked={cancelTrips} onChange={(e) => setCancelTrips(e.target.checked)} />
                <span className="text-[15px]">
                  <span className="font-semibold">Also cancel its {plural(upcomingTrips, 'upcoming trip')}</span>
                  <span className="block text-sm text-muted">
                    {tickets > 0
                      ? `${plural(tickets, 'ticket')} sold: online ones are refunded, cash ones are listed for you to repay, and every passenger is emailed.`
                      : 'No tickets sold on them yet.'}{' '}
                    Leave it unticked to keep them for when it comes back.
                  </span>
                </span>
              </label>
              {cancelTrips && (
                <FormField id="sp-reason" label="Reason on the trips (optional)">
                  <TextInput
                    id="sp-reason"
                    maxLength={200}
                    placeholder="This bus company is no longer on Seatline"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </FormField>
              )}
            </>
          ) : (
            <p className="m-0 text-sm">It has no upcoming trips, so no passenger is affected.</p>
          )}
          {error && (
            <p role="alert" className="m-0 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" variant="danger" disabled={busy} aria-busy={busy}>
              {busy ? 'Suspending…' : cancelTrips ? 'Suspend and cancel trips' : `Suspend ${operator.name}`}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep it active
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function Reactivate({ operator, done, onReactivated }: { operator: ApiPlatformOperator; done: ApiSuspendResult | null; onReactivated: () => void }) {
  const refresh = useRefreshPlatform()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reactivate() {
    setBusy(true)
    setError(null)
    try {
      await updateOperator(operator.id, { status: 'ACTIVE' })
      onReactivated()
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Heading as="h2" size="sm">
        Suspended
      </Heading>
      {done && <SuspendSummary result={done} />}
      <p className="m-0 text-sm text-muted">
        Passengers can’t find or book its buses, and its staff can’t sign in. Reactivate it to put everything back; cancelled trips stay cancelled.
      </p>
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <Button className="self-start" onClick={() => void reactivate()} disabled={busy} aria-busy={busy}>
        {busy ? 'Reactivating…' : 'Reactivate'}
      </Button>
    </div>
  )
}

/** What suspending just did, and any cash the company owes passengers. */
function SuspendSummary({ result }: { result: ApiSuspendResult }) {
  const parts = [
    result.tripsCancelled ? `${plural(result.tripsCancelled, 'trip')} cancelled` : 'no trips cancelled',
    result.refundsPending > 0 && `${plural(result.refundsPending, 'refund')} started`,
    result.passengersEmailed > 0 && `${plural(result.passengersEmailed, 'passenger')} emailed`,
  ].filter((p): p is string => !!p)
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl bg-brand-tint px-4 py-3 text-sm text-brand-ink">
      <p className="m-0 font-semibold">Suspended: {parts.join(', ')}.</p>
      {result.cashToRepay.length > 0 && (
        <>
          <p className="m-0">These passengers paid cash at the station and need repaying in person:</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {result.cashToRepay.map((c) => (
              <li key={c.code} className="flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-mono">{c.code}</span> · seat {c.seatLabel}
                  {c.passengerName ? ` · ${c.passengerName}` : ''}
                </span>
                <span className="font-semibold">{cedis(c.amountPesewas / 100)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Delete for good, only when nothing was ever sold; otherwise say why not. */
function DeleteForm({ operator, deletable, bookings }: { operator: ApiPlatformOperator; deletable: boolean; bookings: number }) {
  const navigate = useNavigate()
  const refresh = useRefreshPlatform()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await deleteOperator(operator.id)
      navigate(`/platform?deleted=${encodeURIComponent(operator.name)}`, { replace: true })
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <Heading as="h3" size="sm">
        Delete for good
      </Heading>
      {!deletable ? (
        <p className="m-0 text-sm text-muted">
          It can’t be deleted: it has {plural(bookings, 'booking')}, and those tickets and payment records must stay for refunds and the books. Suspend it instead.
        </p>
      ) : (
        <>
          <p className="m-0 text-sm text-muted">
            It has never sold a seat, so it can be removed completely, with its buses, routes, trips and staff accounts. This can’t be undone.
          </p>
          {!open ? (
            <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
              Delete…
            </Button>
          ) : (
            <form aria-label={`Delete ${operator.name}`} onSubmit={remove} className="flex flex-col gap-3 rounded-xl bg-canvas p-3.5">
              <FormField id="dl-confirm" label={`Type ${operator.slug} to confirm`}>
                <TextInput id="dl-confirm" mono autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
              </FormField>
              {error && (
                <p role="alert" className="m-0 text-sm font-semibold text-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2.5">
                <Button type="submit" variant="danger" disabled={busy || typed.trim() !== operator.slug} aria-busy={busy}>
                  {busy ? 'Deleting…' : `Delete ${operator.name}`}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false)
                    setTyped('')
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  )
}
