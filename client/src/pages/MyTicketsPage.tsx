import { useState } from 'react'
import { useDeviceTickets, useMyTickets } from '@/api/tickets'
import { maskEmail, useAuth } from '@/app/AuthContext'
import { useBooking } from '@/app/BookingContext'
import { ButtonLink, Card, Heading } from '@/components/atoms'
import { PageHeader, SegmentedControl } from '@/components/molecules'
import { MyTicketCard, isUpcoming } from '@/components/organisms'
import { PublicTemplate } from '@/components/templates'

export function MyTicketsPage() {
  const { passenger, ready } = useAuth()
  const { history } = useBooking()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  // Signed in: the account's tickets (guest purchases with the same email included)
  const upcomingQ = useMyTickets('upcoming', !!passenger)
  const pastQ = useMyTickets('past', !!passenger)
  // Signed out: what this device bought
  const device = useDeviceTickets(history, ready && !passenger)

  const upcoming = passenger ? (upcomingQ.data ?? []) : device.tickets.filter(isUpcoming)
  const past = passenger ? (pastQ.data ?? []) : device.tickets.filter((t) => !isUpcoming(t))
  const shown = tab === 'upcoming' ? upcoming : past
  const loading = !ready || (passenger ? (tab === 'upcoming' ? upcomingQ : pastQ).isPending : device.pending)
  const failed = passenger && (tab === 'upcoming' ? upcomingQ : pastQ).isError

  return (
    <PublicTemplate>
      <div className="flex flex-col gap-4 pb-4 pt-5 md:gap-5 md:pt-8">
        <PageHeader
          title="My tickets"
          subtitle={
            passenger ? (
              <>
                <span className="lg:hidden">
                  {passenger.name} · {maskEmail(passenger.email)}
                </span>
                <span className="hidden lg:inline">Tickets bought with {maskEmail(passenger.email)}</span>
              </>
            ) : (
              'Tickets bought on this device'
            )
          }
          action={
            <div className="hidden md:block">
              <ButtonLink to="/">Book a trip</ButtonLink>
            </div>
          }
        />

        {ready && !passenger && (
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

        {loading ? (
          <p role="status" className="m-0 p-8 text-center text-muted">
            Loading your tickets…
          </p>
        ) : failed ? (
          <p role="alert" className="m-0 rounded-2xl border border-dashed border-line-strong p-8 text-center text-muted">
            We could not load your tickets. Pull to refresh or try again shortly.
          </p>
        ) : shown.length ? (
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
        <ButtonLink to="/" size="lg" block>
          Book a trip
        </ButtonLink>
      </div>
    </PublicTemplate>
  )
}
