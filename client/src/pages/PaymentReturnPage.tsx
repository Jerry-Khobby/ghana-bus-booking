import { Navigate } from 'react-router'
import { useBooking } from '@/app/BookingContext'
import { NotFoundPage } from './NotFoundPage'

/**
 * Paystack's card page sends the payer here when they finish. The hold and
 * payment were saved for the tab, so carry on to the waiting screen, which
 * picks up the result (Paystack also tells the API directly).
 */
export function PaymentReturnPage() {
  const { hold, paymentId } = useBooking()
  if (hold && paymentId) return <Navigate to={`/trips/${hold.tripId}/pay/pending`} replace />
  return (
    <NotFoundPage
      title="Checking your payment"
      body="If the payment went through, your ticket is in your email. Otherwise start again from the bus you picked."
    />
  )
}
