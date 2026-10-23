import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useBooking } from '@/app/BookingContext'
import { Badge, ButtonLink, Card, Heading } from '@/components/atoms'
import { HoldTimer } from '@/components/molecules'
import {
  PayButton,
  PaymentForm,
  PaymentSummary,
  PaymentSummaryDisclosure,
  PaymentSummaryStrip,
  paymentTotal,
} from '@/components/organisms'
import { BookingTemplate } from '@/components/templates'
import { SERVICE_FEE, findTrip } from '@/data/mock'
import type { Trip } from '@/data/types'
import { useCountdown } from '@/hooks/useCountdown'
import { seatList } from '@/lib/format'
import { NotFoundPage } from './NotFoundPage'

/**
 * Shown on any payment step when no seats are held: either none were picked,
 * or the 5-minute hold ran out (then the seats are released here).
 */
export function NoSeatsHeld({ trip, expired }: { trip: Trip; expired: boolean }) {
  const { releaseSeats } = useBooking()
  useEffect(() => {
    if (expired) releaseSeats()
  }, [expired, releaseSeats])

  const title = expired ? 'Your seat hold ran out' : 'Pick a seat first'
  return (
    <BookingTemplate
      step="Pay"
      back={{ to: `/trips/${trip.id}/seat`, label: 'Pick a seat' }}
      mobile={{ title }}
      title={
        <Heading as="h1" size="xl">
          {title}
        </Heading>
      }
    >
      <Card className="flex max-w-xl flex-col gap-4">
        <p className="m-0 text-muted">
          {expired
            ? 'The seats went back on sale and you were not charged. Pick your seats again to continue.'
            : 'Choose free seats on the bus and we will hold them for you for 5 minutes while you pay.'}
        </p>
        <ButtonLink to={`/trips/${trip.id}/seat`} className="self-start">
          Back to the seat map
        </ButtonLink>
      </Card>
    </BookingTemplate>
  )
}

export function PaymentPage() {
  const { tripId } = useParams()
  const trip = findTrip(tripId)
  const booking = useBooking()
  const navigate = useNavigate()

  const seats = booking.tripId === trip?.id ? booking.seats : []
  const secondsLeft = useCountdown(seats.length ? booking.holdExpiresAt : null)

  if (!trip) return <NotFoundPage />
  if (seats.length === 0 || secondsLeft === 0) return <NoSeatsHeld trip={trip} expired={secondsLeft === 0} />

  const total = paymentTotal(trip, seats, SERVICE_FEE)
  const title = `Pay for ${seats.length > 1 ? 'seats' : 'seat'} ${seatList(seats)}`
  const summary = { trip, seats, fee: SERVICE_FEE, secondsLeft }

  return (
    <BookingTemplate
      step="Pay"
      back={{ to: `/trips/${trip.id}/seat`, label: seats.length > 1 ? 'Change seats' : 'Change seat' }}
      title={
        <>
          <Heading as="h1" size="xl">
            {title}
          </Heading>
          <Badge tone="held">Test mode · no real money</Badge>
        </>
      }
      mobile={{
        title,
        trailing: (
          <Badge tone="held" size="sm">
            Test mode
          </Badge>
        ),
      }}
      mobileStrip={secondsLeft !== null ? <HoldTimer secondsLeft={secondsLeft} tone="strip" plural={seats.length > 1} /> : undefined}
      mobileBar={<PayButton total={total} pending={false} />}
    >
      <div className="flex flex-col gap-3.5 md:gap-[18px] lg:flex-row lg:items-start lg:gap-7">
        <PaymentSummaryStrip {...summary} />
        <PaymentSummaryDisclosure {...summary} />
        <div className="min-w-0 flex-1">
          <PaymentForm
            total={total}
            method={booking.method}
            onMethodChange={booking.setMethod}
            network={booking.network}
            onNetworkChange={booking.setNetwork}
            phone={booking.phone}
            onPhoneChange={booking.setPhone}
            onSubmit={() => navigate(`/trips/${trip.id}/pay/pending`)}
            pending={false}
          />
        </div>
        <PaymentSummary {...summary} />
        <p className="m-0 text-[13px] text-muted lg:hidden">
          If payment fails or the timer runs out, the seats go back on sale and you are not charged.
        </p>
      </div>
    </BookingTemplate>
  )
}
