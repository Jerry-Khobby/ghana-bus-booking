import { useState, type FormEvent } from 'react'
import { Button, Heading, TextInput } from '@/components/atoms'
import { FormField, SegmentedControl } from '@/components/molecules'
import { errorMessage, isApiError } from '@/api/client'

type SignInAs = 'agent' | 'operator'

interface StaffSignInCardProps {
  initialRole?: SignInAs
  /** Signs in; throws the server's error if it says no. */
  onSignIn: (email: string, password: string, role: SignInAs) => Promise<void>
}

/** Email and password sign-in for station agents and operators. */
export function StaffSignInCard({ initialRole = 'agent', onSignIn }: StaffSignInCardProps) {
  const [role, setRole] = useState<SignInAs>(initialRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSignIn(email.trim(), password, role)
    } catch (err) {
      const wait = isApiError(err, 'ACCOUNT_LOCKED') ? (err.details.retryAfterSeconds as number | undefined) : undefined
      setError(wait ? `${errorMessage(err)} Try again in ${Math.ceil(wait / 60)} min.` : errorMessage(err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="staff-h" className="flex w-full max-w-[480px] flex-col gap-[22px] rounded-[18px] bg-surface p-5 text-ink md:rounded-[20px] md:p-9">
      <div>
        <Heading as="h1" size="lg" id="staff-h" className="text-[26px] md:text-[30px]">
          Staff sign in
        </Heading>
        <p className="m-0 mt-1.5 text-muted">For station agents and bus operators.</p>
      </div>

      <SegmentedControl
        label="I am a"
        value={role}
        onChange={setRole}
        options={[
          { value: 'agent', label: 'Station agent' },
          { value: 'operator', label: 'Operator' },
        ]}
      />

      <form onSubmit={submit} className="flex flex-col gap-[22px]">
        <FormField id="st-email" label="Work email">
          <TextInput id="st-email" type="email" autoComplete="username" inputSize="lg" required placeholder="name@coastline.example" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField id="st-pass" label="Password">
          <TextInput id="st-pass" type="password" autoComplete="current-password" inputSize="lg" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        {error && (
          <p role="alert" className="m-0 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="min-h-[54px] text-[17px]" disabled={busy} aria-busy={busy}>
          {busy ? 'Signing in…' : role === 'agent' ? 'Sign in to the loading console' : 'Sign in to the operator dashboard'}
        </Button>
      </form>

      <p className="m-0 rounded-[10px] bg-canvas px-3.5 py-3 text-sm text-muted">
        Forgot your password, or need an account? Your operator's admin resets passwords and invites agents from the Agents page.
      </p>
    </section>
  )
}
