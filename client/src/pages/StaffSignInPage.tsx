import { useNavigate, useSearchParams } from 'react-router'
import { useAuth, type StaffRole } from '@/app/AuthContext'
import { StaffSignInCard } from '@/components/organisms'
import { AuthTemplate } from '@/components/templates'

export function StaffSignInPage() {
  const { signInStaff } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialRole: StaffRole = params.get('role') === 'operator' ? 'operator' : 'agent'

  return (
    <AuthTemplate variant="staff">
      <StaffSignInCard
        initialRole={initialRole}
        onSignIn={(email, role) => {
          signInStaff(email, role)
          navigate(role === 'agent' ? '/agent' : '/operator')
        }}
      />
    </AuthTemplate>
  )
}
