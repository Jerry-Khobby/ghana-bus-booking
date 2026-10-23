import { useEffect, useRef, useState } from 'react'
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
import { useCountdown } from '@/hooks/useCountdown'
import { seatList } from '@/lib/format'
import { NotFoundPage } from './NotFoundPage'

/** Simulated wait for the passenger to approve the MoMo prompt. */
const APPROVAL_DELAY_MS = 1800

export function PaymentPage() {
  const { tripId } = useParams()
  const trip = findTrip(tripId)
  const booking = useBooking()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [expired, setExpired] = useState(false)
  const timer = useRef<number | null>(null)

  const seats = booking.tripId === trip?.id ? booking.seats : []
  const secondsLeft = useCountdown(seats.length ? booking.holdExpiresAt : null)
  const { releaseSeats } = booking

  useEffect(() => {
    if (secondsLeft === 0) {
      setExpired(true)
      releaseSeats()
    }
  }, [secondsLeft, releaseSeats])

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  if (!trip) return <NotFoundPage />

  const back = { to: `/trips/${trip.id}/seat`, label: seats.length ? 'Change seats' : 'Pick a seat' }

  if (seats.length === 0) {
    const title = expired ? 'Your seat hold ran out' : 'Pick a seat first'
    return (
      <BookingTemplate step="Pay" back={back} mobile={{ title }} title={<Heading as="h1" size="xl">{title}</Heading>}>
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

  function pay() {
    setPending(true)
    timer.current = window.setTimeout(() => {
      // Leave the page first so it never re-renders with the seats already cleared.
      navigate('/ticket')
      booking.confirmPayment()
    }, APPROVAL_DELAY_MS)
  }

  const total = paymentTotal(trip, seats, SERVICE_FEE)
  const title = `Pay for ${seats.length > 1 ? 'seats' : 'seat'} ${seatList(seats)}`
  const summary = { trip, seats, fee: SERVICE_FEE, secondsLeft }

  return (
    <BookingTemplate
      step="Pay"
      back={back}
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
      mobileBar={<PayButton total={total} pending={pending} />}
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
            onSubmit={pay}
            pending={pending}
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
