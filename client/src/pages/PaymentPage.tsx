import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { pesewasToCedis, useTrip } from '@/api/catalog'
import { errorMessage, isApiError } from '@/api/client'
import { useAuth } from '@/app/AuthContext'
import { useBooking } from '@/app/BookingContext'
import { Badge, ButtonLink, Card, Heading } from '@/components/atoms'
import { HoldTimer, LoadState } from '@/components/molecules'
import {
  PayButton,
  PaymentForm,
  PaymentSummary,
  PaymentSummaryDisclosure,
  PaymentSummaryStrip,
  type PaymentFormErrors,
} from '@/components/organisms'
import { BookingTemplate, PublicTemplate } from '@/components/templates'
import type { Trip } from '@/data/types'
import { useCountdown } from '@/hooks/useCountdown'
import { seatList } from '@/lib/format'
import { NotFoundPage } from './NotFoundPage'

/**
 * Shown on any payment step when no seats are held: either none were picked,
 * or the hold ran out (the server has already put them back on sale).
 */
export function NoSeatsHeld({ trip, expired }: { trip: Pick<Trip, 'id'>; expired: boolean }) {
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
            : 'Choose free seats on the bus and we will hold them for you while you pay.'}
        </p>
        <ButtonLink to={`/trips/${trip.id}/seat`} className="self-start">
          Back to the seat map
        </ButtonLink>
      </Card>
    </BookingTemplate>
  )
}

/**
 * While a booking step fetches its trip: the loading state, Try again on a
 * failed load, or "not found" when the trip really doesn't exist. Null once
 * the trip is there.
 */
export function tripGate(trip: UseQueryResult<Trip>, label = 'Loading your booking…'): ReactNode | null {
  if (trip.data) return null
  if (trip.isError && isApiError(trip.error, 'NOT_FOUND')) return <NotFoundPage />
  return (
    <PublicTemplate>
      <LoadState
        pending={trip.isPending || trip.isFetching}
        error={trip.error}
        onRetry={() => void trip.refetch()}
        label={label}
        className="py-16"
      />
    </PublicTemplate>
  )
}

/** The payment step's data: the trip, the hold on it, and how long it has left. */
export function useHeldTrip(tripId: string | undefined) {
  const trip = useTrip(tripId)
  const booking = useBooking()
  const hold = booking.hold?.tripId === tripId ? booking.hold : null
  const secondsLeft = useCountdown(hold ? hold.expiresAt : null)
  const { refreshHold } = booking
  // The timer reached zero: the server may have given a paying hold a little
  // longer, so ask before calling it expired
  useEffect(() => {
    if (secondsLeft === 0) void refreshHold()
  }, [secondsLeft, refreshHold])
  return { trip, hold, secondsLeft, booking }
}

/** Splits a payment error into the field it belongs to. */
function formErrors(error: unknown): PaymentFormErrors {
  if (isApiError(error, 'INVALID_PHONE') || isApiError(error, 'NETWORK_MISMATCH')) return { phone: errorMessage(error) }
  if (isApiError(error, 'VALIDATION_FAILED')) {
    const f = error.fields
    return {
      phone: f.phone?.[0],
      email: f.contactEmail?.[0] && 'Enter a valid email address',
      name: f.passengerName?.[0],
      form: f.phone || f.contactEmail || f.passengerName ? undefined : errorMessage(error),
    }
  }
  return { form: errorMessage(error) }
}

export function PaymentPage() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const { trip, hold, secondsLeft, booking } = useHeldTrip(tripId)
  const [errors, setErrors] = useState<PaymentFormErrors>({})
  const [pending, setPending] = useState(false)
  const { passenger } = useAuth()
  const { email, phone, setEmail, setPhone } = booking
  const prefilled = useRef<string | null>(null)

  // Signed in: the ticket goes to their email, and their saved number pays.
  // Once per sign-in, so clearing a field doesn't fill it again.
  useEffect(() => {
    if (!passenger || prefilled.current === passenger.id) return
    prefilled.current = passenger.id
    if (!email) setEmail(passenger.email)
    if (!phone && passenger.phone) setPhone(`0${passenger.phone.replace(/^\+233/, '')}`)
  }, [passenger, email, phone, setEmail, setPhone])

  const gate = tripGate(trip)
  if (gate || !trip.data) return gate
  if (!hold || secondsLeft === 0) return <NoSeatsHeld trip={trip.data} expired={secondsLeft === 0} />

  const t = trip.data
  const seats = hold.seats
  const fee = pesewasToCedis(hold.feePesewas)
  const total = pesewasToCedis(hold.totalPesewas)
  const title = `Pay for ${seats.length > 1 ? 'seats' : 'seat'} ${seatList(seats)}`
  const summary = { trip: t, seats, fee, secondsLeft }

  async function submit() {
    setErrors({})
    setPending(true)
    try {
      const payment = await booking.pay()
      if (payment.status === 'SUCCESS') {
        booking.completePayment(payment)
        navigate('/ticket')
      } else if (payment.status === 'FAILED' || payment.status === 'ABANDONED') {
        navigate(`/trips/${t.id}/pay/failed`, { state: { message: payment.failureMessage } })
      } else if (payment.method === 'CARD' && payment.authorizationUrl) {
        // Paystack's page takes the card, then sends the payer to /payment/return
        window.location.assign(payment.authorizationUrl)
        return
      } else {
        navigate(`/trips/${t.id}/pay/pending`)
      }
    } catch (error) {
      if (isApiError(error, 'HOLD_EXPIRED')) {
        await booking.refreshHold()
        return
      }
      setErrors(formErrors(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <BookingTemplate
      step="Pay"
      back={{ to: `/trips/${t.id}/seat`, label: seats.length > 1 ? 'Change seats' : 'Change seat' }}
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
      mobileBar={<PayButton total={total} pending={pending} method={booking.method} />}
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
            email={booking.email}
            onEmailChange={booking.setEmail}
            name={booking.name}
            onNameChange={booking.setName}
            errors={errors}
            onSubmit={submit}
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
