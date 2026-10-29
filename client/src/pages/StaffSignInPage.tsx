import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/app/AuthContext'
import { StaffSignInCard } from '@/components/organisms'
import { AuthTemplate } from '@/components/templates'
import { safeNext } from './SignInPage'

export function StaffSignInPage() {
  const { signInStaff, staff, ready } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialRole = params.get('role') === 'operator' ? 'operator' : 'agent'

  if (ready && staff) return <Navigate to={safeNext(params.get('next'), staff.home)} replace />

  return (
    <AuthTemplate variant="staff">
      <StaffSignInCard
        initialRole={initialRole}
        onSignIn={async (email, password, role) => {
          const signedIn = await signInStaff(email, password, role)
          navigate(safeNext(params.get('next'), signedIn.home))
        }}
      />
    </AuthTemplate>
  )
}
