import { QRCodeSVG } from 'qrcode.react'
import type { ApiTicket } from '@/api/booking'
import { hhmm } from '@/api/catalog'
import { Badge, type BadgeTone } from '@/components/atoms'

function Place({ label, city, station, align = 'left' }: { label: string; city: string; station: string; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : undefined}>
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="m-0 font-display text-[22px] font-bold">{city}</p>
      <p className="m-0 text-[13px] text-muted">{station}</p>
    </div>
  )
}

function Fact({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="m-0 text-xs text-muted">{label}</p>
      <p className={mono ? 'm-0 font-mono text-[30px] font-semibold leading-[1.1]' : 'm-0 text-[15px] font-semibold leading-[1.3]'}>
        {value}
      </p>
    </div>
  )
}

const STATE: Record<ApiTicket['status'], { tone: BadgeTone; label: string }> = {
  CONFIRMED: { tone: 'valid', label: 'Valid' },
  BOARDED: { tone: 'departed', label: 'Used' },
  NO_SHOW: { tone: 'warning', label: 'Not used' },
}

const BUS: Record<ApiTicket['bus']['type'], string> = {
  AC_COACH: 'AC coach',
  STANDARD: 'Standard bus',
  MINIBUS: 'Minibus',
}

/** "14:30", or for a fill-and-go bus "When full" (with its latest time). */
function leaves(ticket: ApiTicket) {
  if (ticket.mode === 'FIXED_TIME') return hhmm(ticket.departureAt) ?? '—'
  return ticket.leaveBy ? `When full · by ${hhmm(ticket.leaveBy)}` : 'When full'
}

/** The boarding pass. The page behind it must be brand green for the notch cut-outs to read. */
interface TicketCardProps {
  ticket: ApiTicket
  /** e.g. "Ticket 1 of 3" when a booking has several seats. */
  position?: { index: number; total: number }
}

export function TicketCard({ ticket, position }: TicketCardProps) {
  const label = position && position.total > 1 ? `Ticket ${position.index + 1} of ${position.total}` : 'Ticket'
  const state = STATE[ticket.status]
  const { origin, destination } = ticket.route
  return (
    <article aria-label={`${label}, seat ${ticket.seatLabel}`} className="overflow-hidden rounded-[18px] bg-surface print:break-inside-avoid">
      <div className="flex flex-col gap-3.5 px-5 pb-[18px] pt-5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-baseline gap-2">
            <span className="font-display text-lg font-extrabold">Seatline</span>
            {position && position.total > 1 && <span className="text-[13px] font-semibold text-muted">{label}</span>}
          </span>
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
        <div className="flex items-end justify-between gap-3">
          <Place label="From" city={origin.city} station={origin.name} />
          <svg width="40" height="16" viewBox="0 0 40 16" aria-hidden="true" className="mb-6 shrink-0">
            <path d="M2 8h34m-6-6 6 6-6 6" fill="none" stroke="#16201C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <Place label="To" city={destination.city} station={destination.name} align="right" />
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-canvas p-3.5">
          <Fact label="Seat" value={ticket.seatLabel} />
          <Fact label="Bay" value={String(ticket.bay.number)} />
          <Fact label="Leaves" value={leaves(ticket)} mono={false} />
        </div>
        <p className="m-0 text-sm text-muted">
          {ticket.operator.name} · {BUS[ticket.bus.type]} · <span className="font-mono">{ticket.bus.plate}</span>
          {ticket.passengerName && <> · {ticket.passengerName}</>}
        </p>
      </div>

      <div aria-hidden="true" className="flex items-center">
        <div className="h-7 w-3.5 rounded-r-full bg-brand" />
        <div className="flex-1 border-t-2 border-dashed border-line-strong" />
        <div className="h-7 w-3.5 rounded-l-full bg-brand" />
      </div>

      <div className="flex flex-col items-center gap-2.5 px-5 pb-[22px] pt-[18px]">
        <div className="rounded-[10px] border border-line bg-surface p-3">
          <QRCodeSVG value={ticket.qrPayload} size={189} fgColor="#16201C" title={`QR code for ticket ${ticket.code}`} />
        </div>
        <p className="m-0 font-mono text-lg font-semibold tracking-[0.08em]">{ticket.code}</p>
        <p className="m-0 text-center text-sm text-muted">
          {ticket.status === 'CONFIRMED'
            ? 'Show this at the bus door. It can be scanned once.'
            : ticket.status === 'BOARDED'
              ? 'This ticket was scanned when you boarded.'
              : 'The bus left without this ticket being scanned.'}
        </p>
      </div>
    </article>
  )
}
