import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ButtonLink } from '@/components/atoms'
import { PaymentFailedCard } from '@/components/organisms'
import { BookingTemplate } from '@/components/templates'
import { seatList } from '@/lib/format'
import { NoSeatsHeld, tripGate, useHeldTrip } from './PaymentPage'

export function PayFailedPage() {
  const { tripId } = useParams()
  const { state } = useLocation() as { state: { message?: string | null } | null }
  const { trip, hold, secondsLeft, booking } = useHeldTrip(tripId)
  const { refreshHold } = booking

  // The seats go back to HELD after a failure; pick up the real time left
  useEffect(() => {
    void refreshHold()
  }, [refreshHold])

  const gate = tripGate(trip)
  if (gate || !trip.data) return gate
  if (!hold || secondsLeft === 0) return <NoSeatsHeld trip={trip.data} expired={secondsLeft === 0} />

  const seats = hold.seats
  const seatsLabel = `${seats.length > 1 ? 'Seats' : 'Seat'} ${seatList(seats)}`

  return (
    <BookingTemplate
      step="Pay"
      back={{ to: `/trips/${trip.data.id}/pay`, label: 'Back to payment' }}
      title={null}
      mobile={{ title: 'Step 3 of 4 · Pay', asHeading: false }}
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-3.5 md:gap-5 md:pt-6">
        <PaymentFailedCard seatsLabel={seatsLabel} secondsLeft={secondsLeft} reason={state?.message ?? undefined} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ButtonLink to={`/trips/${trip.data.id}/pay`} size="lg">
            Try again
          </ButtonLink>
          <ButtonLink to={`/trips/${trip.data.id}/pay`} variant="outline" size="lg">
            Use another number or card
          </ButtonLink>
        </div>
        <p className="m-0 text-center text-[15px] text-muted">
          If the hold runs out, {seatsLabel.toLowerCase()} {seats.length > 1 ? 'go' : 'goes'} back on sale.{' '}
          <Link to="/trips" className="font-semibold">
            Choose another bus
          </Link>
        </p>
      </div>
    </BookingTemplate>
  )
}
