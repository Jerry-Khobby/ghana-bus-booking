import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { verifyPayment } from '@/api/booking'
import { pesewasToCedis } from '@/api/catalog'
import { errorMessage } from '@/api/client'
import { usePayment } from '@/api/payments'
import { Button } from '@/components/atoms'
import { HeldSeatsStrip, PaymentPendingCard } from '@/components/organisms'
import { BookingTemplate } from '@/components/templates'
import { seatList } from '@/lib/format'
import { NoSeatsHeld, tripGate, useHeldTrip } from './PaymentPage'

function maskLocal(phone: string) {
  const d = phone.replace(/\D/g, '')
  return d.length >= 7 ? `${d.slice(0, 3)} *** ${d.slice(-4)}` : 'your phone'
}

/** Waiting for the passenger to approve on their phone (or their bank). Moves on by itself. */
export function PayPendingPage() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const { trip, hold, secondsLeft, booking } = useHeldTrip(tripId)
  const payment = usePayment(booking.paymentId, hold?.holdToken)
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { completePayment, refreshHold } = booking

  const status = payment.data?.status
  useEffect(() => {
    if (!payment.data || !tripId) return
    if (status === 'SUCCESS') {
      completePayment(payment.data)
      navigate('/ticket', { replace: true })
    } else if (status === 'FAILED' || status === 'ABANDONED') {
      void refreshHold()
      navigate(`/trips/${tripId}/pay/failed`, { replace: true, state: { message: payment.data.failureMessage } })
    }
  }, [status, payment.data, tripId, completePayment, refreshHold, navigate])

  const gate = tripGate(trip)
  if (gate || !trip.data) return gate
  if (!hold || !booking.paymentId) return <NoSeatsHeld trip={trip.data} expired={secondsLeft === 0} />

  const t = trip.data
  const seatsLabel = `${hold.seats.length > 1 ? 'Seats' : 'Seat'} ${seatList(hold.seats)}`

  async function approved() {
    setChecking(true)
    setNote(null)
    try {
      const result = await verifyPayment(booking.paymentId!, hold!.holdToken)
      if (result.status === 'PENDING' || result.status === 'INITIATED') {
        setNote('Not approved yet. Approve the prompt on your phone, then check again.')
      }
      await payment.refetch()
    } catch (error) {
      setNote(errorMessage(error))
    } finally {
      setChecking(false)
    }
  }

  return (
    <BookingTemplate
      step="Pay"
      back={{ to: `/trips/${t.id}/pay`, label: 'Back to payment' }}
      title={null}
      mobile={{ title: 'Step 3 of 4 · Pay', asHeading: false }}
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-3.5 md:gap-5 md:pt-6">
        <PaymentPendingCard
          method={booking.method}
          network={booking.network}
          maskedPhone={maskLocal(booking.phone)}
          total={pesewasToCedis(payment.data?.amountPesewas ?? hold.totalPesewas)}
        />
        {payment.data?.providerMessage && (
          <p className="m-0 rounded-xl bg-canvas px-4 py-3 text-[15px]">{payment.data.providerMessage}</p>
        )}

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
            detail={`${t.from.city} → ${t.to.city} · ${t.plate}${t.bay ? ` · bay ${t.bay}` : ''}`}
          />
        </section>

        <Button size="lg" onClick={approved} disabled={checking} aria-busy={checking}>
          {checking ? 'Checking…' : 'I have approved it'}
        </Button>
        {note && (
          <p role="status" className="m-0 text-center text-[15px] text-muted">
            {note}
          </p>
        )}
        <p className="m-0 text-center text-sm text-muted">
          Wrong number? Wait for this prompt to time out, then{' '}
          <Link to={`/trips/${t.id}/pay`} className="font-semibold">
            pay with another
          </Link>
          .
        </p>
      </div>
    </BookingTemplate>
  )
}
