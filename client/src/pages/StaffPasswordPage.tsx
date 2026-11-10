import { useNavigate, useSearchParams } from 'react-router'
import { setStaffPassword } from '@/api/auth'
import { useAuth } from '@/app/AuthContext'
import { StaffPasswordCard } from '@/components/organisms'
import { AuthTemplate } from '@/components/templates'

/**
 * Where invite and reset emails land: /staff/accept?token=… for a new
 * agent or admin, /staff/reset?token=… for a password an admin reset.
 * Saving signs them in and opens their console.
 */
function StaffPasswordPage({ kind }: { kind: 'accept' | 'reset' }) {
  const { setStaffSession } = useAuth()
  const navigate = useNavigate()
  const token = useSearchParams()[0].get('token') ?? ''

  return (
    <AuthTemplate variant="staff">
      <StaffPasswordCard
        kind={kind}
        hasToken={!!token}
        onSubmit={async (password) => {
          const signedIn = await setStaffPassword(kind === 'accept' ? 'accept-invite' : 'reset-password', token, password)
          navigate(setStaffSession(signedIn).home, { replace: true })
        }}
      />
    </AuthTemplate>
  )
}

export const StaffAcceptPage = () => <StaffPasswordPage kind="accept" />
export const StaffResetPage = () => <StaffPasswordPage kind="reset" />
