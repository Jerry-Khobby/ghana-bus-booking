import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/app/AuthContext'
import { useBooking } from '@/app/BookingContext'
import { PassengerSignInForm, SignInBenefits } from '@/components/organisms'
import { AuthTemplate } from '@/components/templates'

export function SignInPage() {
  const { signInPassenger } = useAuth()
  const booking = useBooking()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  function verified(phone: string) {
    signInPassenger(phone)
    // "Your mobile money number is filled in for you"
    if (!booking.phone) booking.setPhone(`0${phone}`)
    navigate(params.get('next') ?? '/tickets')
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
