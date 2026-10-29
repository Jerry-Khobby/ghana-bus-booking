import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { toSeatStatus, useSeatMap, useTrip } from '@/api/catalog'
import { errorMessage, isApiError } from '@/api/client'
import { useBooking } from '@/app/BookingContext'
import { Badge, Card, Heading } from '@/components/atoms'
import { SeatLegend } from '@/components/molecules'
import { BookingSummary, MobileSeatBar, SeatMap } from '@/components/organisms'
import { BookingTemplate, PublicTemplate } from '@/components/templates'
import { useCountdown } from '@/hooks/useCountdown'
import { plural, statusLabel } from '@/lib/format'
import { MAX_SEATS } from '@/lib/seats'
import { NotFoundPage } from './NotFoundPage'

export function SeatPage() {
  const { tripId } = useParams()
  const trip = useTrip(tripId)
  const seatMap = useSeatMap(tripId)
  const booking = useBooking()
  const [problem, setProblem] = useState<string | null>(null)

  const selected = booking.tripId === tripId ? booking.seats : []
  const secondsLeft = useCountdown(selected.length ? booking.holdExpiresAt : null)
  const { refreshHold } = booking

  // The hold has run out: the server let the seats go; catch up with it.
  useEffect(() => {
    if (secondsLeft === 0) void refreshHold()
  }, [secondsLeft, refreshHold])

  if (trip.isPending || seatMap.isPending) {
    return (
      <PublicTemplate>
        <p role="status" className="py-16 text-center text-muted">
          Loading the bus…
        </p>
      </PublicTemplate>
    )
  }
  if (isApiError(trip.error, 'NOT_FOUND') || !trip.data) {
    return trip.isError && !isApiError(trip.error, 'NOT_FOUND') ? (
      <NotFoundPage title="We could not load this bus" body={errorMessage(trip.error)} />
    ) : (
      <NotFoundPage />
    )
  }

  const t = trip.data
  const live = t.status === 'loading'
  const bookable = t.status === 'loading' || t.status === 'scheduled'
  const passengers = booking.passengers
  const paying = !!booking.paymentId

  async function pick(seat: string) {
    if (!tripId) return
    setProblem(null)
    try {
      const result = await booking.toggleSeat(tripId, seat)
      if (result === 'limit') setProblem(`You can hold up to ${plural(MAX_SEATS, 'seat')} in one booking. Tap one of your seats to swap it.`)
    } catch (error) {
      setProblem(
        isApiError(error, 'PAYMENT_IN_PROGRESS')
          ? 'A payment is in progress for your seats. Finish or cancel it first.'
          : errorMessage(error),
      )
    }
  }

  const map = seatMap.data
  const summaryProps = { trip: t, seats: selected, passengers, secondsLeft }

  return (
    <BookingTemplate
      step="Seat"
      back={{ to: '/trips', label: 'All buses on this route' }}
      title={
        <>
          <Heading as="h1" size="xl">
            {passengers > 1 ? `Pick ${passengers} seats` : 'Pick your seat'}
          </Heading>
          <Badge tone={t.status} dot={live}>
            {statusLabel(t)}
            {live ? ' · live' : ''}
          </Badge>
        </>
      }
      mobile={{
        title: passengers > 1 ? `Pick ${passengers} seats` : 'Pick your seat',
        subtitle: `${t.from.city} → ${t.to.city} · ${t.plate}`,
        trailing: live ? (
          <Badge tone="loading" size="sm">
            Live
          </Badge>
        ) : undefined,
      }}
      mobileBar={bookable ? <MobileSeatBar {...summaryProps} /> : undefined}
    >
      <div className="mb-3.5 md:hidden">
        <SeatLegend compact />
      </div>

      {!bookable && (
        <Card className="mb-4">
          <p className="m-0 font-semibold">This bus can no longer be booked online.</p>
        </Card>
      )}

      {problem && (
        <p role="alert" className="m-0 mb-4 rounded-xl border border-dashed border-held-line bg-held px-4 py-3 text-sm font-semibold text-held-ink">
          {problem}
        </p>
      )}
      {paying && (
        <p className="m-0 mb-4 rounded-xl bg-sunken px-4 py-3 text-sm font-semibold">
          A payment is in progress for {selected.length > 1 ? 'these seats' : 'this seat'}.
        </p>
      )}

      <div className="flex flex-col gap-7 md:flex-row md:items-start md:gap-6 lg:gap-7">
        <div className="min-w-0 md:w-[340px] md:shrink-0 lg:w-auto lg:flex-1">
          {map ? (
            <SeatMap
              rows={map.rows}
              cols={map.cols}
              cells={map.cells.map((cell) => ({ ...cell, status: cell.type === 'SEAT' ? toSeatStatus(cell.status) : undefined }))}
              selected={selected}
              onPick={pick}
              busy={booking.saving || !bookable || paying}
            />
          ) : (
            <Card>
              <p className="m-0 text-muted">{errorMessage(seatMap.error)}</p>
            </Card>
          )}
        </div>
        <aside aria-label="Your booking" className="hidden min-w-0 flex-col gap-4 md:flex md:flex-1 lg:w-[360px] lg:flex-none">
          <BookingSummary {...summaryProps} />
          <SeatLegend />
        </aside>
      </div>
    </BookingTemplate>
  )
}
