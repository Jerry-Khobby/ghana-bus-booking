import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useBooking } from '@/app/BookingContext'
import { Badge, Heading } from '@/components/atoms'
import { SeatLegend } from '@/components/molecules'
import { BookingSummary, MobileSeatBar, SeatMap } from '@/components/organisms'
import { BookingTemplate } from '@/components/templates'
import { findTrip } from '@/data/mock'
import { useCountdown } from '@/hooks/useCountdown'
import { plural, statusLabel } from '@/lib/format'
import { MAX_SEATS, seatStatuses } from '@/lib/seats'
import { NotFoundPage } from './NotFoundPage'

export function SeatPage() {
  const { tripId } = useParams()
  const trip = findTrip(tripId)
  const booking = useBooking()
  const statuses = useMemo(() => (trip ? seatStatuses(trip) : new Map()), [trip])
  const [limitHit, setLimitHit] = useState(false)

  const selected = booking.tripId === trip?.id ? booking.seats : []
  const secondsLeft = useCountdown(selected.length ? booking.holdExpiresAt : null)
  const { releaseSeats } = booking

  // The hold has run out: give the seats back.
  useEffect(() => {
    if (secondsLeft === 0) releaseSeats()
  }, [secondsLeft, releaseSeats])

  if (!trip) return <NotFoundPage />

  const live = trip.status === 'loading'
  const passengers = booking.passengers

  function pick(seat: number) {
    if (!trip) return
    setLimitHit(booking.toggleSeat(trip.id, seat) === 'limit')
  }

  const summaryProps = { trip, seats: selected, passengers, secondsLeft }

  return (
    <BookingTemplate
      step="Seat"
      back={{ to: '/trips', label: 'All buses on this route' }}
      title={
        <>
          <Heading as="h1" size="xl">
            {passengers > 1 ? `Pick ${passengers} seats` : 'Pick your seat'}
          </Heading>
          <Badge tone={trip.status} dot={live}>
            {statusLabel(trip)}
            {live ? ' · live' : ''}
          </Badge>
        </>
      }
      mobile={{
        title: passengers > 1 ? `Pick ${passengers} seats` : 'Pick your seat',
        subtitle: `${trip.from.city} → ${trip.to.city} · ${trip.plate}`,
        trailing: live ? (
          <Badge tone="loading" size="sm">
            Live
          </Badge>
        ) : undefined,
      }}
      mobileBar={<MobileSeatBar {...summaryProps} />}
    >
      <div className="mb-3.5 md:hidden">
        <SeatLegend compact />
      </div>

      {limitHit && (
        <p role="alert" className="m-0 mb-4 rounded-xl border border-dashed border-held-line bg-held px-4 py-3 text-sm font-semibold text-held-ink">
          You can hold up to {plural(MAX_SEATS, 'seat')} in one booking. Tap one of your seats to swap it.
        </p>
      )}

      <div className="flex flex-col gap-7 md:flex-row md:items-start md:gap-6 lg:gap-7">
        <div className="min-w-0 md:w-[340px] md:shrink-0 lg:w-auto lg:flex-1">
          <SeatMap statuses={statuses} selected={selected} onPick={pick} />
        </div>
        <aside aria-label="Your booking" className="hidden min-w-0 flex-col gap-4 md:flex md:flex-1 lg:w-[360px] lg:flex-none">
          <BookingSummary {...summaryProps} />
          <SeatLegend />
        </aside>
      </div>
    </BookingTemplate>
  )
}
