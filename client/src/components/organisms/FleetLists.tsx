import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge, ButtonLink, TextInput } from '@/components/atoms'
import { MiniSeatPlan } from '@/components/molecules'
import type { Bus, LayoutRecord, RouteRecord, StationAgent } from '@/data/types'
import { buildRows } from '@/lib/seats'
import { ResponsiveTable, RowCard } from './ResponsiveTable'

/* ---------- Buses ---------- */

const busStatus = {
  active: { tone: 'valid', label: 'Active' },
  workshop: { tone: 'warning', label: 'In workshop' },
} as const

function shortType(t: Bus['type']) {
  return t === 'Air-conditioned coach' ? 'AC coach' : t
}

export function BusesTable({ buses, layouts }: { buses: Bus[]; layouts: LayoutRecord[] }) {
  const layoutOf = (b: Bus) => layouts.find((l) => l.id === b.layoutId)
  const layoutText = (b: Bus) => {
    const l = layoutOf(b)
    return l ? `${l.name} · ${buildRows(l.layout).total}` : 'No layout'
  }
  const layoutLink = (b: Bus, children: ReactNode, className?: string) => (
    <Link to={`/operator/layouts/${b.layoutId}`} className={className ?? 'font-semibold'}>
      {children}
    </Link>
  )
  const status = (b: Bus) => (
    <Badge tone={busStatus[b.status].tone}>
      {busStatus[b.status].label}
    </Badge>
  )

  return (
    <ResponsiveTable
      label="Fleet"
      rows={buses}
      rowKey={(b) => b.plate}
      minWidth={720}
      columns={[
        { header: 'Plate', cell: (b) => b.plate, className: 'font-mono font-semibold' },
        { header: 'Type', cell: (b) => shortType(b.type) },
        { header: 'Seat layout', cell: (b) => layoutLink(b, layoutText(b)) },
        { header: 'Status', cell: status },
        { header: 'Next trip', cell: (b) => b.next, className: 'text-muted' },
      ]}
      card={(b) => (
        <RowCard className="gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="m-0 font-mono text-[17px] font-semibold">{b.plate}</p>
            {status(b)}
          </div>
          <p className="m-0 text-sm text-muted">
            {shortType(b.type)} · {b.next}
          </p>
          {layoutLink(b, <>Seat layout: {layoutText(b)}</>, 'inline-flex min-h-11 items-center self-start text-[15px] font-semibold')}
        </RowCard>
      )}
    />
  )
}

/* ---------- Seat layouts ---------- */

export function layoutSummary(l: LayoutRecord, busCount: number) {
  const { total } = buildRows(l.layout)
  const shape = `${l.layout.left} + ${l.layout.right} · ${l.layout.rows} rows${l.layout.backRow ? ' + back row' : ''} · ${total} seats`
  const used = busCount === 0 ? 'not used yet' : `used by ${busCount} bus${busCount === 1 ? '' : 'es'}`
  return `${shape} · ${used}`
}

export function LayoutCard({ layout, busCount }: { layout: LayoutRecord; busCount: number }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 md:p-5">
      <MiniSeatPlan layout={layout.layout} />
      <div>
        <h2 className="m-0 font-display text-[19px] font-bold">{layout.name}</h2>
        <p className="m-0 mt-0.5 text-sm text-muted">{layoutSummary(layout, busCount)}</p>
      </div>
      <ButtonLink to={`/operator/layouts/${layout.id}`} variant="outline" className="mt-auto min-h-11">
        Edit layout<span className="sr-only">: {layout.name}</span>
      </ButtonLink>
    </article>
  )
}

/* ---------- Routes and fares ---------- */

interface RoutesFaresProps {
  routes: RouteRecord[]
  fares: Record<string, string>
  onFareChange: (routeId: string, value: string) => void
}

export function RoutesFaresTable({ routes, fares, onFareChange }: RoutesFaresProps) {
  const fareInput = (r: RouteRecord, className: string) => (
    <TextInput
      aria-label={`Base fare for ${r.name}`}
      inputMode="decimal"
      value={fares[r.id] ?? String(r.fare)}
      onChange={(e) => onFareChange(r.id, e.target.value.replace(/[^\d.]/g, ''))}
      className={className}
    />
  )

  return (
    <ResponsiveTable
      label="Routes"
      rows={routes}
      rowKey={(r) => r.id}
      columns={[
        { header: 'Route', cell: (r) => r.name, className: 'font-semibold' },
        { header: 'Stations', cell: (r) => r.stations, className: 'text-muted' },
        { header: 'Trips today', cell: (r) => r.tripsToday },
        { header: 'Base fare (GH¢)', cell: (r) => fareInput(r, '!h-11 w-[120px] rounded-lg px-2.5'), className: 'py-2' },
      ]}
      card={(r) => (
        <RowCard className="flex-row items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 font-semibold">{r.name}</p>
            <p className="m-0 text-[13px] text-muted">
              {r.stations} · {r.tripsToday} trips today
            </p>
          </div>
          <div className="flex flex-none items-center gap-1.5">
            <span aria-hidden="true" className="text-sm text-muted">
              GH¢
            </span>
            {fareInput(r, '!h-11 w-[88px] rounded-lg px-2.5')}
          </div>
        </RowCard>
      )}
    />
  )
}

/* ---------- Agents ---------- */

interface AgentsTableProps {
  agents: StationAgent[]
  /** Agent ids whose reset link or invite was just sent. */
  sent: string[]
  onSend: (id: string) => void
}

function actionLabel(a: StationAgent, done: boolean) {
  if (a.status === 'invited') return done ? 'Invite resent' : 'Resend invite'
  return done ? 'Reset link sent' : 'Reset password'
}

export function AgentsTable({ agents, sent, onSend }: AgentsTableProps) {
  const status = (a: StationAgent) => <Badge tone={a.status === 'invited' ? 'warning' : 'valid'}>{a.status === 'invited' ? 'Invited' : 'Active'}</Badge>
  const action = (a: StationAgent) => {
    const done = sent.includes(a.id)
    return (
      <button
        type="button"
        disabled={done}
        onClick={() => onSend(a.id)}
        className="min-h-10 shrink-0 cursor-pointer rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:border-ink disabled:cursor-default disabled:border-transparent disabled:bg-brand-tint disabled:text-brand-ink md:min-h-10"
      >
        {actionLabel(a, done)}
        <span className="sr-only"> for {a.name}</span>
      </button>
    )
  }

  return (
    <ResponsiveTable
      label="Agents"
      rows={agents}
      rowKey={(a) => a.id}
      minWidth={760}
      columns={[
        {
          header: 'Agent',
          cell: (a) => (
            <>
              <p className="m-0 font-semibold">{a.name}</p>
              <p className="m-0 text-[13px] text-muted">{a.email}</p>
            </>
          ),
        },
        { header: 'Station and bays', cell: (a) => `${a.station} · bays ${a.bays}` },
        { header: 'Status', cell: status },
        { header: 'Last active', cell: (a) => a.lastActive, className: 'text-muted' },
        { header: <span className="sr-only">Actions</span>, cell: action, className: 'text-right' },
      ]}
      card={(a) => (
        <RowCard className="flex-row items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="m-0 font-semibold">{a.name}</p>
              {status(a)}
            </div>
            <p className="m-0 text-sm text-muted">
              {a.station} · bays {a.bays}
            </p>
            <p className="m-0 text-[13px] text-muted [overflow-wrap:anywhere]">{a.email}</p>
            <p className="m-0 text-[13px] text-muted">Last active: {a.lastActive}</p>
          </div>
          {action(a)}
        </RowCard>
      )}
    />
  )
}
