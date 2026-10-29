import { useState } from 'react'
import {
  inviteAgent,
  resendAgentInvite,
  resetAgentPassword,
  settleCash,
  updateAgent,
  useAgents,
  useBays,
  useRefreshAdmin,
  useUnsettledCash,
  type ApiAgent,
} from '@/api/admin'
import { errorMessage } from '@/api/client'
import { Button, Card, Checkbox, Dropdown, Heading, TextInput } from '@/components/atoms'
import { FormField, InlineFormCard, LoadState, PageHeader } from '@/components/molecules'
import { AgentsTable } from '@/components/organisms'
import { stationName } from '@/components/organisms/SearchForm'
import { OperatorTemplate } from '@/components/templates'
import type { StationAgent } from '@/data/types'
import { cedis } from '@/lib/format'

/** "Now", "12 min ago", "Today 08:40", "Yesterday", "Mon 26 Oct" */
function lastActive(a: ApiAgent): string {
  if (a.status === 'INVITED') return 'Not signed in yet'
  if (!a.lastActiveAt) return 'Not seen yet'
  const then = new Date(a.lastActiveAt)
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000)
  if (minutes < 2) return 'Now'
  if (minutes < 60) return `${minutes} min ago`
  const day = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Africa/Accra' })
  const time = then.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })
  if (day(then) === day(new Date())) return `Today ${time}`
  if (day(then) === day(new Date(Date.now() - 86_400_000))) return 'Yesterday'
  return then.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Accra' })
}

/** [4, 5, 6] → "4–6"; [1, 3] → "1, 3" */
function bayList(numbers: number[]) {
  const sorted = [...numbers].sort((a, b) => a - b)
  if (!sorted.length) return 'none'
  const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1)
  return consecutive && sorted.length > 1 ? `${sorted[0]}–${sorted.at(-1)}` : sorted.join(', ')
}

const toRow = (a: ApiAgent): StationAgent => ({
  id: a.id,
  name: a.name,
  email: a.email,
  station: stationName(a.station),
  bays: bayList(a.bays.map((b) => b.number)),
  status: a.status === 'ACTIVE' ? 'active' : a.status === 'INVITED' ? 'invited' : 'disabled',
  lastActive: lastActive(a),
})

export function AgentsPage() {
  const agents = useAgents()
  const refresh = useRefreshAdmin()
  const [sent, setSent] = useState<string[]>([])
  const [busy, setBusy] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const list = agents.data ?? []

  async function act(id: string, work: () => Promise<unknown>, after?: () => void) {
    setBusy((b) => [...b, id])
    setProblem(null)
    try {
      await work()
      after?.()
      await refresh()
    } catch (e) {
      setProblem(errorMessage(e))
    } finally {
      setBusy((b) => b.filter((x) => x !== id))
    }
  }

  function send(id: string) {
    const agent = list.find((a) => a.id === id)
    if (!agent) return
    void act(id, () => (agent.status === 'INVITED' ? resendAgentInvite(id) : resetAgentPassword(id)), () => setSent((s) => [...s, id]))
  }

  function toggle(id: string) {
    const agent = list.find((a) => a.id === id)
    if (!agent) return
    void act(id, () => updateAgent(id, { status: agent.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' }))
  }

  return (
    <OperatorTemplate title="Agents">
      <Invite />
      {problem && (
        <p role="alert" className="m-0 rounded-xl border border-danger px-4 py-3 text-sm font-semibold text-danger">
          {problem}
        </p>
      )}
      {agents.data ? (
        <AgentsTable agents={list.map(toRow)} sent={sent} onSend={send} onToggle={toggle} busy={busy} />
      ) : (
        <LoadState pending={agents.isPending} error={agents.error} onRetry={() => void agents.refetch()} label="Loading agents…" />
      )}
      <Cash />
    </OperatorTemplate>
  )
}

/** The header and its "Invite agent" form: station first, then that station's bays. */
function Invite() {
  const bays = useBays()
  const refresh = useRefreshAdmin()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [stationId, setStationId] = useState('')
  const [bayIds, setBayIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [invited, setInvited] = useState<string | null>(null)

  const stations = [...new Map((bays.data ?? []).map((b) => [b.station.id, b.station])).values()]
  const station = stationId || stations[0]?.id || ''
  const stationBays = (bays.data ?? []).filter((b) => b.station.id === station).sort((a, b) => a.number - b.number)

  async function invite() {
    setError(null)
    if (!bayIds.length) {
      setError('Pick at least one bay')
      return
    }
    try {
      await inviteAgent({ name: name.trim(), email: email.trim(), stationId: station, bayIds })
      await refresh()
      setInvited(email.trim())
      setName('')
      setEmail('')
      setBayIds([])
      setOpen(false)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title={
          <>
            <span className="lg:hidden">Station agents</span>
            <span className="hidden lg:inline">Agents</span>
          </>
        }
        subtitle="People who sell walk-in seats and scan tickets at your bays"
        action={
          <Button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full md:w-auto">
            Invite agent
          </Button>
        }
      />
      {invited && !open && (
        <p role="status" className="m-0 rounded-xl bg-brand-tint px-4 py-3 text-sm text-brand-ink">
          Invite sent to {invited}. They set a password from the email, then sign in on the staff page.
        </p>
      )}
      {open && (
        <InlineFormCard
          title="Invite an agent"
          label="Invite agent"
          submitLabel="Send invite"
          onCancel={() => setOpen(false)}
          onSubmit={() => void invite()}
          note={error ? <span className="font-semibold text-danger">{error}</span> : 'They get an email to set a password, then sign in on the staff page.'}
        >
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
            <FormField id="ag-name" label="Full name">
              <TextInput id="ag-name" required autoComplete="off" placeholder="e.g. Efua Boateng" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField id="ag-email" label="Work email">
              <TextInput id="ag-email" type="email" required autoComplete="off" placeholder="name@coastline.example" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField id="ag-station" label="Station">
              {stations.length ? (
                <Dropdown
                  id="ag-station"
                  labelledBy="ag-station-label"
                  value={station}
                  options={stations.map((s) => ({ value: s.id, label: stationName(s) }))}
                  onChange={(id) => {
                    setStationId(id)
                    setBayIds([])
                  }}
                />
              ) : (
                <p className="m-0 text-sm text-muted">Add bays on Routes and fares first.</p>
              )}
            </FormField>
          </div>
          {stationBays.length > 0 && (
            <fieldset className="m-0 mt-3.5 border-0 p-0">
              <legend className="pb-2 text-sm font-semibold">Bays they load</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {stationBays.map((b) => (
                  <label key={b.id} className="flex min-h-11 cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={bayIds.includes(b.id)}
                      onChange={() => setBayIds((ids) => (ids.includes(b.id) ? ids.filter((x) => x !== b.id) : [...ids, b.id]))}
                    />
                    Bay {b.number}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </InlineFormCard>
      )}
    </>
  )
}

/** Walk-in cash each agent still holds, and marking it collected. */
function Cash() {
  const cash = useUnsettledCash()
  const refresh = useRefreshAdmin()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function settle(agentId: string) {
    setBusy(agentId)
    setError(null)
    try {
      await settleCash(agentId)
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <Heading as="h2" size="sm">
        Cash to collect
      </Heading>
      {!cash.data ? (
        <LoadState pending={cash.isPending} error={cash.error} onRetry={() => void cash.refetch()} label="Loading cash…" />
      ) : cash.data.length === 0 ? (
        <p className="m-0 text-muted">No agent is holding walk-in cash.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {cash.data.map((c) => (
            <li key={c.agent.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-sunken py-3 last:border-b-0">
              <div>
                <p className="m-0 font-semibold">{c.agent.name}</p>
                <p className="m-0 text-sm text-muted">
                  {c.tickets} cash ticket{c.tickets === 1 ? '' : 's'} · {cedis(c.amountPesewas / 100)}
                </p>
              </div>
              <Button variant="outline" disabled={busy === c.agent.id} onClick={() => void settle(c.agent.id)}>
                {busy === c.agent.id ? 'Saving…' : 'Mark as collected'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </Card>
  )
}
