import { useParams } from 'react-router'
import { useAuth } from '@/app/AuthContext'
import { useBooking } from '@/app/BookingContext'
import { Button, ButtonLink, StatusMark } from '@/components/atoms'
import { TicketCard } from '@/components/organisms'
import { PassTemplate } from '@/components/templates'
import { findTrip, trips } from '@/data/mock'
import { passengerTickets } from '@/data/tickets'
import type { Ticket } from '@/data/types'
import { plural } from '@/lib/format'
import { NotFoundPage } from './NotFoundPage'

/** Shown when the page is opened directly, before any booking in this session. */
const sampleTicket: Ticket = { code: 'SL-7Q4K-2M', tripId: 'gr-4471-24', seat: 14, passengerName: 'Ama K.', phone: '0240000000' }

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return 'your phone'
  return `${digits.slice(0, 3)} *** ${digits.slice(-4)}`
}

/** One ticket by code: from this session first, then the account's history. */
function lookup(code: string, history: Ticket[], phone: string): Ticket | null {
  const booked = history.find((t) => t.code === code)
  if (booked) return booked
  const past = passengerTickets.find((t) => t.code === code && t.tripId)
  return past ? { code: past.code, tripId: past.tripId!, seat: past.seat, passengerName: 'Ama K.', phone } : null
}

export function TicketPage() {
  const { code } = useParams()
  const { tickets: latest, history } = useBooking()
  const { passenger } = useAuth()

  let tickets: Ticket[]
  if (code) {
    const found = lookup(code, history, passenger ? `0${passenger.phone}` : '')
    if (!found) return <NotFoundPage title="We could not find that ticket" body="Check the code in your SMS, or open it from My tickets." />
    tickets = [found]
  } else {
    tickets = latest.length ? latest : [sampleTicket]
  }

  const trip = findTrip(tickets[0].tripId) ?? trips[0]
  const many = tickets.length > 1
  // Opened from My tickets: the passenger already knows they are booked.
  const fromList = Boolean(code)

  return (
    <PassTemplate tone="brand">
      <div className="flex items-center gap-3 text-white">
        <StatusMark ok />
        <div>
          <h1 className="m-0 font-display text-2xl font-extrabold tracking-[-0.02em]">
            {fromList ? 'Your ticket' : many ? `You're booked · ${plural(tickets.length, 'seat')}` : "You're booked"}
          </h1>
          <p className="m-0 text-sm text-on-brand">
            {many ? 'One ticket per passenger. ' : ''}Also sent by SMS to {maskPhone(tickets[0].phone)}
          </p>
        </div>
      </div>

      {many && (
        <p className="m-0 rounded-xl bg-brand-dark px-3.5 py-3 text-sm text-on-brand">
          Each QR code works once. Share each ticket with the person sitting in that seat, or show them one by one at the door.
        </p>
      )}

      {tickets.map((t, i) => (
        <TicketCard key={t.code} ticket={t} trip={trip} position={{ index: i, total: tickets.length }} />
      ))}

      <div className="grid grid-cols-2 gap-2.5 print:hidden">
        <Button variant="light" onClick={() => window.print()}>
          {many ? 'Save all as PDF' : 'Save as PDF'}
        </Button>
        <ButtonLink to={fromList ? '/tickets' : '/'} variant="outline-light">
          {fromList ? 'My tickets' : 'Done'}
        </ButtonLink>
      </div>
    </PassTemplate>
  )
}
