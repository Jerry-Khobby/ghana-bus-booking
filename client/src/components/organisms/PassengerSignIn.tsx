import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, FieldLabel, Heading } from '@/components/atoms'
import { CodeInput } from '@/components/molecules'
import { useCountdown } from '@/hooks/useCountdown'
import { cx } from '@/lib/format'

const RESEND_SECONDS = 45

const benefits = [
  { long: 'See all your upcoming and past tickets in one place', short: 'All your tickets in one place' },
  { long: 'Your mobile money number is filled in for you', short: 'Your mobile money number filled in' },
  { long: 'Show your QR ticket even if you lose the SMS', short: 'Show your QR even if you lose the SMS' },
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
        <p className="m-0 mt-4 text-[17px] text-on-dark">Sign in with your phone number. No password to remember.</p>
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
      <p className="m-0 text-sm text-on-dark">You can also book without an account. We text your ticket to the number you pay with.</p>
    </section>
  )
}

interface PassengerSignInFormProps {
  /** Called with the national number once the code is verified. */
  onVerified: (phone: string) => void
}

/** Two steps: phone number, then the 6-digit SMS code. */
export function PassengerSignInForm({ onVerified }: PassengerSignInFormProps) {
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [resendAt, setResendAt] = useState<number | null>(null)
  const resendIn = useCountdown(resendAt)
  const digits = phone.replace(/\D/g, '').replace(/^0/, '')
  const phoneValid = digits.length === 9

  function sendCode(e: FormEvent) {
    e.preventDefault()
    if (!phoneValid) return
    setCode('')
    setResendAt(Date.now() + RESEND_SECONDS * 1000)
    setStep('code')
  }

  function verify(e: FormEvent) {
    e.preventDefault()
    if (code.length === 6) onVerified(`${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`)
  }

  return (
    <section
      aria-labelledby="signin-h"
      className="flex flex-col justify-center gap-[18px] rounded-[18px] border border-line bg-surface px-4 py-5 md:gap-[22px] md:rounded-[20px] md:p-8 lg:flex-1 lg:gap-6 lg:p-10"
    >
      {step === 'phone' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-[18px] md:gap-[22px] lg:gap-6">
          <div>
            <Heading as="h2" size="lg" id="signin-h" className="text-[26px] md:text-[30px]">
              Sign in or create an account
            </Heading>
            <p className="m-0 mt-1.5 text-muted">We will text you a 6-digit code.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="si-phone">Phone number</FieldLabel>
            <div className="flex gap-2">
              <span className="flex h-[52px] flex-none items-center rounded-[10px] border border-line-strong bg-canvas px-3.5 font-mono font-semibold" aria-hidden="true">
                +233
              </span>
              <input
                id="si-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="24 000 0000"
                aria-describedby="si-phone-hint"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-[52px] min-w-0 flex-1 rounded-[10px] border border-line-strong bg-surface px-3.5 font-mono text-lg text-ink hover:border-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
            <p id="si-phone-hint" className={cx('m-0 text-sm', phone && !phoneValid ? 'text-danger' : 'text-muted')}>
              {phone && !phoneValid ? 'Enter the 9 digits after +233, e.g. 24 000 0000.' : 'Ghana numbers only for now.'}
            </p>
          </div>
          <Button type="submit" size="lg" className="min-h-[54px] text-[17px]" disabled={!phoneValid}>
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-[18px] md:gap-[22px] lg:gap-6">
          <div>
            <Heading as="h2" size="lg" id="signin-h" className="text-[26px] md:text-[30px]">
              Enter the code
            </Heading>
            <p className="m-0 mt-1.5 text-muted">
              Sent by SMS to <strong className="text-ink">+233 {digits.slice(0, 2)} *** {digits.slice(-4)}</strong>
            </p>
          </div>
          <CodeInput value={code} onChange={setCode} />
          <p className="m-0 text-sm text-muted">Test mode: any 6 digits will do.</p>
          <Button type="submit" size="lg" className="min-h-[54px] text-[17px]" disabled={code.length < 6}>
            Verify and continue
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[15px]">
            {resendIn ? (
              <span className="text-muted">
                Resend code in <span className="font-mono">0:{String(resendIn).padStart(2, '0')}</span>
              </span>
            ) : (
              <button type="button" onClick={() => setResendAt(Date.now() + RESEND_SECONDS * 1000)} className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand underline">
                Resend code
              </button>
            )}
            <button type="button" onClick={() => setStep('phone')} className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand underline">
              Change number
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
