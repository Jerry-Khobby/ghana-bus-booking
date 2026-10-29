import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, FieldLabel, Heading } from '@/components/atoms'
import { CodeInput } from '@/components/molecules'
import { useCountdown } from '@/hooks/useCountdown'
import { maskEmail, useAuth, type Passenger } from '@/app/AuthContext'
import { requestCode } from '@/api/auth'
import { errorMessage, isApiError } from '@/api/client'

const benefits = [
  { long: 'See all your upcoming and past tickets in one place', short: 'All your tickets in one place' },
  { long: 'Your mobile money number is filled in for you', short: 'Your mobile money number filled in' },
  { long: 'Show your QR ticket even if you lose the email', short: 'Show your QR even if you lose the email' },
]

function Step({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-full bg-gold text-[13px] font-bold text-gold-ink">
      {n}
    </span>
  )
}

/** Dark panel explaining why to sign in: a tall column on desktop, a strip on tablet, a card on phones. */
export function SignInBenefits() {
  return (
    <section aria-label="Why sign in" className="flex flex-col justify-between gap-3 rounded-[18px] bg-ink p-4 text-white md:rounded-[20px] md:px-8 md:py-7 lg:flex-1 lg:gap-8 lg:p-10">
      <div className="hidden lg:block">
        <Heading as="h1" size="lg" className="text-[40px] leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
          Your tickets, on any phone.
        </Heading>
        <p className="m-0 mt-4 text-[17px] text-on-dark">Sign in with your email. No password to remember.</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:grid md:grid-cols-3 md:gap-[18px] lg:flex lg:gap-3.5">
        {benefits.map((b, i) => (
          <li key={b.short} className="flex items-start gap-3">
            <Step n={i + 1} />
            <span className="text-[15px] lg:text-base">
              <span className="lg:hidden">{b.short}</span>
              <span className="hidden lg:inline">{b.long}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-sm text-on-dark">You can also book without an account. We email your ticket to the address you give.</p>
    </section>
  )
}

interface PassengerSignInFormProps {
  /** Called once the code is right and the passenger is signed in. */
  onVerified: (passenger: Passenger) => void
}

/** Two steps: email address, then the 6-digit code we email. */
export function PassengerSignInForm({ onVerified }: PassengerSignInFormProps) {
  const { signInPassenger } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resendAt, setResendAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resendIn = useCountdown(resendAt)
  const emailValid = /^[^s@]+@[^s@]+.[^s@]+$/.test(email.trim())

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await requestCode(email.trim())
      setCode('')
      setResendAt(Date.now() + res.resendAfterSeconds * 1000)
      setStep('code')
    } catch (e) {
      const wait = isApiError(e) ? (e.details.retryAfterSeconds as number | undefined) : undefined
      setError(wait ? `${errorMessage(e)} (about ${Math.ceil(wait / 60)} min)` : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function sendCode(e: FormEvent) {
    e.preventDefault()
    if (emailValid) void send()
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      onVerified(await signInPassenger(email.trim(), code))
    } catch (err) {
      const left = isApiError(err, 'OTP_INVALID') ? (err.details.attemptsLeft as number | undefined) : undefined
      setError(left ? `${errorMessage(err)}. ${left} ${left === 1 ? 'try' : 'tries'} left.` : errorMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const problem = error && (
    <p role="alert" className="m-0 text-sm font-semibold text-danger">
      {error}
    </p>
  )

  return (
    <section
      aria-labelledby="signin-h"
      className="flex flex-col justify-center gap-[18px] rounded-[18px] border border-line bg-surface px-4 py-5 md:gap-[22px] md:rounded-[20px] md:p-8 lg:flex-1 lg:gap-6 lg:p-10"
    >
      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-[18px] md:gap-[22px] lg:gap-6">
          <div>
            <Heading as="h2" size="lg" id="signin-h" className="text-[26px] md:text-[30px]">
              Sign in or create an account
            </Heading>
            <p className="m-0 mt-1.5 text-muted">We will email you a 6-digit code.<span className="lg:hidden"> No password needed.</span></p>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="si-email">Email address</FieldLabel>
            <input
              id="si-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-describedby="si-email-hint"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-[52px] min-w-0 rounded-[10px] border border-line-strong bg-surface px-3.5 text-lg text-ink hover:border-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            />
            <p id="si-email-hint" className="m-0 text-sm text-muted">
              Use the email you put on your tickets, and they show up in your account.
            </p>
          </div>
          {problem}
          <Button type="submit" size="lg" className="min-h-[54px] text-[17px]" disabled={!emailValid || busy} aria-busy={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-[18px] md:gap-[22px] lg:gap-6">
          <div>
            <Heading as="h2" size="lg" id="signin-h" className="text-[26px] md:text-[30px]">
              Enter the code
            </Heading>
            <p className="m-0 mt-1.5 text-muted">
              Sent to <strong className="text-ink">{maskEmail(email.trim())}</strong>. Check spam if it isn't there in a minute.
            </p>
          </div>
          <CodeInput value={code} onChange={setCode} />
          {problem}
          <Button type="submit" size="lg" className="min-h-[54px] text-[17px]" disabled={code.length < 6 || busy} aria-busy={busy}>
            {busy ? 'Checking…' : 'Verify and continue'}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[15px]">
            {resendIn ? (
              <span className="text-muted">
                Resend<span className="hidden sm:inline"> code</span> in <span className="font-mono">0:{String(resendIn).padStart(2, '0')}</span>
              </span>
            ) : (
              <button type="button" onClick={() => void send()} disabled={busy} className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand underline">
                Resend code
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setError(null)
              }}
              className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand underline"
            >
              Change email
            </button>
          </div>
        </form>
      )}

      <div className="h-px bg-sunken" aria-hidden="true" />
      <p className="m-0 text-[15px] text-muted">
        Station agent or bus operator?{' '}
        <Link to="/staff/signin" className="font-semibold">
          Staff sign in
        </Link>
      </p>
    </section>
  )
}
