import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge, type BadgeTone } from '@/components/atoms'
import type { PassengerTicket, TicketState } from '@/data/types'
import { cedis } from '@/lib/format'

const badge: Record<TicketState, { tone: BadgeTone; label: (t: PassengerTicket) => string }> = {
  loading: { tone: 'loading', label: (t) => `Loading now${t.bay ? ` · bay ${t.bay}` : ''}` },
  scheduled: { tone: 'scheduled', label: () => 'Scheduled' },
  used: { tone: 'valid', label: () => 'Used' },
  'not-used': { tone: 'departed', label: () => 'Not used' },
}

export function isUpcoming(t: PassengerTicket) {
  return t.state === 'loading' || t.state === 'scheduled'
}

function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: 'lg' | 'sm' }) {
  return (
    <div>
      <p className="m-0 text-xs text-muted">{label}</p>
      <p className={mono === 'lg' ? 'm-0 font-mono text-[22px] font-semibold' : mono === 'sm' ? 'm-0 font-mono text-sm font-semibold leading-[1.9]' : 'm-0 text-[15px] font-semibold leading-[1.8]'}>
        {children}
      </p>
    </div>
  )
}

/** One ticket in "My tickets": upcoming ones open the QR pass, past ones say what happened. */
export function MyTicketCard({ ticket }: { ticket: PassengerTicket }) {
  const b = badge[ticket.state]
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:gap-3 md:px-5 md:py-[18px]">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={b.tone}>{b.label(ticket)}</Badge>
          <span className="font-mono text-xs text-muted md:text-[13px]">{ticket.code}</span>
        </div>
        <div>
          <h2 className="m-0 font-display text-xl font-bold md:text-[22px]">{ticket.route}</h2>
          <p className="m-0 mt-0.5 text-sm text-muted md:text-[15px]">{ticket.when}</p>
        </div>
        <div className="flex justify-between gap-2 rounded-[10px] bg-canvas px-3 py-2.5 md:grid md:grid-cols-3 md:p-3">
          <Fact label="Seat" mono="lg">
            {ticket.seat}
          </Fact>
          <div className="text-right md:text-left">
            <Fact label="Bus" mono="sm">
              {ticket.plate}
            </Fact>
          </div>
          <div className="hidden md:block">
            <Fact label="Paid">{cedis(ticket.paid)}</Fact>
          </div>
        </div>
      </div>
      {isUpcoming(ticket) ? (
        <Link
          to={`/ticket/${ticket.code}`}
          className="mt-auto flex min-h-[52px] items-center justify-center gap-2 border-t border-line font-semibold no-underline"
        >
          Show QR ticket
        </Link>
      ) : (
        <p className="m-0 mt-auto flex min-h-[52px] items-center justify-center border-t border-line px-3 text-center text-[15px] text-muted">{ticket.note}</p>
      )}
    </article>
  )
}
