import { useNavigate, useParams } from 'react-router'
import { useBooking } from '@/app/BookingContext'
import { Button, ButtonLink } from '@/components/atoms'
import { HeldSeatsStrip, PaymentPendingCard, paymentTotal } from '@/components/organisms'
import { BookingTemplate } from '@/components/templates'
import { SERVICE_FEE, findTrip } from '@/data/mock'
import { useCountdown } from '@/hooks/useCountdown'
import { seatList } from '@/lib/format'
import { NotFoundPage } from './NotFoundPage'
import { NoSeatsHeld } from './PaymentPage'

function maskLocal(phone: string) {
  const d = phone.replace(/\D/g, '')
  return d.length >= 7 ? `${d.slice(0, 3)} *** ${d.slice(-4)}` : 'your phone'
}

export function PayPendingPage() {
  const { tripId } = useParams()
  const trip = findTrip(tripId)
  const booking = useBooking()
  const navigate = useNavigate()
  const seats = booking.tripId === trip?.id ? booking.seats : []
  const secondsLeft = useCountdown(seats.length ? booking.holdExpiresAt : null)

  if (!trip) return <NotFoundPage />
  if (seats.length === 0 || secondsLeft === 0) return <NoSeatsHeld trip={trip} expired={secondsLeft === 0} />

  const seatsLabel = `${seats.length > 1 ? 'Seats' : 'Seat'} ${seatList(seats)}`

  function approved() {
    navigate('/ticket')
    booking.confirmPayment()
  }

  function cancel() {
    booking.releaseSeats()
    navigate(`/trips/${trip!.id}/seat`)
  }

  return (
    <BookingTemplate
      step="Pay"
      back={{ to: `/trips/${trip.id}/pay`, label: 'Back to payment' }}
      title={null}
      mobile={{ title: 'Step 3 of 4 · Pay', asHeading: false }}
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-3.5 md:gap-5 md:pt-6">
        <PaymentPendingCard
          method={booking.method}
          network={booking.network}
          maskedPhone={maskLocal(booking.phone)}
          total={paymentTotal(trip, seats, SERVICE_FEE)}
        />

        <section aria-label="Help" className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-[18px]">
            <h2 className="m-0 mb-1.5 text-base font-semibold">No prompt on your phone?</h2>
            <p className="m-0 text-[15px] text-muted">
              <span className="lg:hidden">Check the number and signal. Some networks show pending approvals in the mobile money menu.</span>
              <span className="hidden lg:inline">
                Check that the number is right and the phone has signal. Some networks let you find pending approvals in the mobile money menu.
              </span>
            </p>
          </div>
          <HeldSeatsStrip
            label={seatsLabel}
            secondsLeft={secondsLeft}
            detail={`${trip.from.city} → ${trip.to.city} · ${trip.plate}${trip.bay ? ` · bay ${trip.bay}` : ''}`}
          />
        </section>

        <p className="m-0 text-center text-sm text-muted">Test mode: choose what happened on the phone.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Button size="lg" onClick={approved}>
            I have approved it
          </Button>
          <ButtonLink to={`/trips/${trip.id}/pay/failed`} variant="outline" size="lg">
            It did not work
          </ButtonLink>
        </div>
        <button type="button" onClick={cancel} className="min-h-11 cursor-pointer self-center border-0 bg-transparent p-2.5 font-semibold text-brand underline-offset-4 hover:underline">
          Cancel and release my {seats.length > 1 ? 'seats' : 'seat'}
        </button>
      </div>
    </BookingTemplate>
  )
}
