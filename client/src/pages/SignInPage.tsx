import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth, type Passenger } from '@/app/AuthContext'
import { useBooking } from '@/app/BookingContext'
import { PassengerSignInForm, SignInBenefits } from '@/components/organisms'
import { AuthTemplate } from '@/components/templates'

/** Only paths inside the app, so ?next= can't send people elsewhere. */
export function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback
}

export function SignInPage() {
  const { passenger, ready } = useAuth()
  const booking = useBooking()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'), '/tickets')

  if (ready && passenger) return <Navigate to={next} replace />

  function verified(p: Passenger) {
    // "Your mobile money number is filled in for you"
    if (!booking.phone && p.phone) booking.setPhone(`0${p.phone.replace(/^\+233/, '')}`)
    if (!booking.email) booking.setEmail(p.email)
    navigate(next)
  }

  return (
    <AuthTemplate variant="passenger">
      {/* Form first on phones and tablets; the benefits panel leads on desktop. */}
      <div className="contents lg:order-2 lg:flex lg:flex-1">
        <PassengerSignInForm onVerified={verified} />
      </div>
      <div className="contents lg:order-1 lg:flex lg:flex-1">
        <SignInBenefits />
      </div>
    </AuthTemplate>
  )
}
