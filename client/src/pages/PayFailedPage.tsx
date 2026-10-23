import { Link, useParams } from 'react-router'
import { useBooking } from '@/app/BookingContext'
import { ButtonLink } from '@/components/atoms'
import { PaymentFailedCard } from '@/components/organisms'
import { BookingTemplate } from '@/components/templates'
import { findTrip } from '@/data/mock'
import { useCountdown } from '@/hooks/useCountdown'
import { seatList } from '@/lib/format'
import { NotFoundPage } from './NotFoundPage'
import { NoSeatsHeld } from './PaymentPage'

export function PayFailedPage() {
  const { tripId } = useParams()
  const trip = findTrip(tripId)
  const booking = useBooking()
  const seats = booking.tripId === trip?.id ? booking.seats : []
  const secondsLeft = useCountdown(seats.length ? booking.holdExpiresAt : null)

  if (!trip) return <NotFoundPage />
  if (seats.length === 0 || secondsLeft === 0) return <NoSeatsHeld trip={trip} expired={secondsLeft === 0} />

  const seatsLabel = `${seats.length > 1 ? 'Seats' : 'Seat'} ${seatList(seats)}`

  return (
    <BookingTemplate
      step="Pay"
      back={{ to: `/trips/${trip.id}/pay`, label: 'Back to payment' }}
      title={null}
      mobile={{ title: 'Payment failed' }}
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-3.5 md:gap-5 md:pt-6">
        <PaymentFailedCard seatsLabel={seatsLabel} secondsLeft={secondsLeft} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ButtonLink to={`/trips/${trip.id}/pay/pending`} size="lg">
            Try again
          </ButtonLink>
          <ButtonLink to={`/trips/${trip.id}/pay`} variant="outline" size="lg">
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
