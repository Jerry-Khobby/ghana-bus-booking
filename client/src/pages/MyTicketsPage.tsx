import { useState } from 'react'
import { maskedIntl, useAuth } from '@/app/AuthContext'
import { useBooking } from '@/app/BookingContext'
import { ButtonLink, Card, Heading } from '@/components/atoms'
import { PageHeader, SegmentedControl } from '@/components/molecules'
import { MyTicketCard, isUpcoming } from '@/components/organisms'
import { PublicTemplate } from '@/components/templates'
import { SERVICE_FEE, findTrip } from '@/data/mock'
import { passengerTickets } from '@/data/tickets'
import type { PassengerTicket, Ticket } from '@/data/types'
import { departureLabel } from '@/lib/format'

/** A ticket bought in this session, in the shape "My tickets" lists. */
function fromBooking(t: Ticket): PassengerTicket | null {
  const trip = findTrip(t.tripId)
  if (!trip) return null
  return {
    code: t.code,
    tripId: trip.id,
    route: `${trip.from.city} → ${trip.to.city}`,
    when: `Today · ${departureLabel(trip).toLowerCase()}`,
    seat: t.seat,
    plate: trip.plate,
    paid: trip.fare + SERVICE_FEE,
    state: trip.status === 'loading' ? 'loading' : 'scheduled',
    bay: trip.bay,
  }
}

export function MyTicketsPage() {
  const { passenger } = useAuth()
  const { history } = useBooking()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  const session = history.map(fromBooking).filter((t): t is PassengerTicket => t !== null)
  // Signed out, only this session's purchases are known; signed in, the account history joins them.
  const all = passenger ? [...session, ...passengerTickets.filter((p) => !session.some((s) => s.code === p.code))] : session
  const upcoming = all.filter(isUpcoming)
  const past = all.filter((t) => !isUpcoming(t))
  const shown = tab === 'upcoming' ? upcoming : past

  return (
    <PublicTemplate>
      <div className="flex flex-col gap-4 pb-4 pt-5 md:gap-5 md:pt-8">
        <PageHeader
          title="My tickets"
          subtitle={passenger ? `Tickets bought with ${maskedIntl(passenger.phone)}` : 'Tickets bought on this device'}
          action={
            <ButtonLink to="/trips" className="hidden md:inline-flex">
              Book a trip
            </ButtonLink>
          }
        />

        {!passenger && (
          <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <Heading as="h2" size="sm">
                Sign in to see all your tickets
              </Heading>
              <p className="m-0 mt-1 text-muted">Tickets you bought on other phones, and your past trips, appear once you sign in.</p>
            </div>
            <ButtonLink to="/signin?next=/tickets" variant="dark" className="shrink-0">
              Sign in
            </ButtonLink>
          </Card>
        )}

        <div className="max-w-[360px]">
          <SegmentedControl
            label="Show"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'upcoming', label: `Upcoming · ${upcoming.length}` },
              { value: 'past', label: `Past · ${past.length}` },
            ]}
          />
        </div>

        {shown.length ? (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:gap-4">
            {shown.map((t) => (
              <MyTicketCard key={t.code} ticket={t} />
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-2xl border border-dashed border-line-strong p-8 text-center text-muted">
            {tab === 'upcoming' ? 'No upcoming trips. Book one and it shows up here.' : 'No past trips yet.'}
          </p>
        )}

        <p className="m-0 text-sm text-muted">Need to change or cancel a ticket? Speak to an agent at the station before the bus leaves.</p>
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-canvas px-4 pb-4 pt-3 md:hidden">
        <ButtonLink to="/trips" size="lg" block>
          Book a trip
        </ButtonLink>
      </div>
    </PublicTemplate>
  )
}
