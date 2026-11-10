import { useState, type FormEvent } from 'react'
import { errorMessage, isApiError } from '@/api/client'
import { Button, ButtonLink, Heading, TextInput } from '@/components/atoms'
import { FormField } from '@/components/molecules'

/** The API's rule: at least 10 characters, not a common password. */
export const MIN_STAFF_PASSWORD = 10

interface StaffPasswordCardProps {
  /** A new invite, or a reset an admin sent. */
  kind: 'accept' | 'reset'
  /** False when the link has no token at all. */
  hasToken: boolean
  /** Sets the password and signs in; throws the server's error if it says no. */
  onSubmit: (password: string) => Promise<void>
}

/** Choose a password from an invite or reset email. */
export function StaffPasswordCard({ kind, hasToken, onSubmit }: StaffPasswordCardProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deadLink, setDeadLink] = useState(!hasToken)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("The two passwords don't match.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(password)
    } catch (err) {
      if (isApiError(err, 'TOKEN_INVALID')) setDeadLink(true)
      else setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const title = kind === 'accept' ? 'Set up your account' : 'Choose a new password'
  return (
    <section aria-labelledby="pw-h" className="flex w-full max-w-[480px] flex-col gap-[22px] rounded-[18px] bg-surface p-5 text-ink md:rounded-[20px] md:p-9">
      <div>
        <Heading as="h1" size="lg" id="pw-h" className="text-[26px] md:text-[30px]">
          {title}
        </Heading>
        <p className="m-0 mt-1.5 text-muted">
          {kind === 'accept' ? 'Pick the password you will sign in with. Then you go straight to your console.' : 'Your admin sent this link. The old password stops working once you save.'}
        </p>
      </div>

      {deadLink ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="m-0 rounded-[10px] bg-canvas px-3.5 py-3 text-[15px]">
            {hasToken ? 'This link is wrong, was already used, or has expired.' : 'This link is missing its code.'} Ask your operator's admin to send
            a new one from the Agents page.
          </p>
          <ButtonLink to="/staff/signin" variant="outline">
            Go to staff sign in
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-[22px]">
          <FormField id="pw-new" label="New password" hint={`At least ${MIN_STAFF_PASSWORD} characters. Not your email, and not a common password.`}>
            <TextInput
              id="pw-new"
              type="password"
              autoComplete="new-password"
              inputSize="lg"
              required
              minLength={MIN_STAFF_PASSWORD}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <FormField id="pw-again" label="Type it again">
            <TextInput
              id="pw-again"
              type="password"
              autoComplete="new-password"
              inputSize="lg"
              required
              minLength={MIN_STAFF_PASSWORD}
              maxLength={200}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </FormField>
          {error && (
            <p role="alert" className="m-0 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="min-h-[54px] text-[17px]" disabled={busy} aria-busy={busy}>
            {busy ? 'Saving…' : kind === 'accept' ? 'Save and sign in' : 'Save new password'}
          </Button>
        </form>
      )}
    </section>
  )
}
