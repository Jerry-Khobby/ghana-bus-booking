import { Heading, StatusMark } from '@/components/atoms'
import type { MomoNetwork, PaymentMethod } from '@/data/types'
import { cedis, mmss } from '@/lib/format'

function PhonePrompt() {
  return (
    <div aria-hidden="true" className="flex size-20 items-center justify-center rounded-full bg-held md:size-24">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16201C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <path d="M10.5 18.5h3" />
        <path d="M9 9.5l2 2 4-4" stroke="#006B3D" strokeWidth="2.2" />
      </svg>
    </div>
  )
}

interface PendingProps {
  method: PaymentMethod
  network: MomoNetwork
  maskedPhone: string
  total: number
}

/** "Approve the payment on your phone" card with the waiting indicator. */
export function PaymentPendingCard({ method, network, maskedPhone, total }: PendingProps) {
  return (
    <section
      aria-labelledby="pp-h"
      className="flex flex-col items-center gap-4 rounded-[18px] border border-line bg-surface px-4 py-6 text-center md:gap-[18px] md:rounded-[20px] md:p-9"
    >
      <PhonePrompt />
      <div>
        <Heading as="h1" size="lg" id="pp-h" className="text-[24px] md:text-[32px]">
          {method === 'momo' ? 'Approve the payment on your phone' : 'Confirm the payment with your bank'}
        </Heading>
        <p className="m-0 mt-2 text-muted md:text-[17px]">
          {method === 'momo' ? (
            <>
              We sent a prompt to <strong className="text-ink">{maskedPhone} ({network})</strong> for{' '}
              <strong className="text-ink">{cedis(total)}</strong>. Enter your mobile money PIN there.
            </>
          ) : (
            <>
              Your bank may ask you to approve <strong className="text-ink">{cedis(total)}</strong> in its app or by SMS code.
            </>
          )}
        </p>
      </div>
      <div role="status" className="flex items-center gap-2.5 rounded-full bg-canvas px-4 py-2.5 font-semibold">
        <span aria-hidden="true" className="flex gap-[5px]">
          <span className="size-2 animate-pulse rounded-full bg-brand" />
          <span className="size-2 animate-pulse rounded-full bg-brand opacity-60 [animation-delay:150ms]" />
          <span className="size-2 animate-pulse rounded-full bg-brand opacity-30 [animation-delay:300ms]" />
        </span>
        Waiting for your approval
      </div>
      <p className="m-0 text-[15px] text-muted">This page moves on by itself as soon as the payment goes through.</p>
    </section>
  )
}

/** Dark strip showing what is still held and for how long. */
export function HeldSeatsStrip({ label, detail, secondsLeft }: { label: string; detail?: string; secondsLeft: number | null }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-ink p-[18px] text-white">
      <p className="m-0 font-semibold text-gold">
        {label}
        {secondsLeft !== null && (
          <>
            {' '}
            held for <span className="font-mono">{mmss(secondsLeft)}</span>
          </>
        )}
      </p>
      {detail && <p className="m-0 text-[15px] text-on-dark">{detail}</p>}
    </div>
  )
}

/** Full wording on desktop, the shorter phone and tablet wording below that. */
const reasons = [
  { long: 'The prompt was not approved within the time allowed', short: 'Prompt not approved in time' },
  { long: 'Not enough money in the mobile money wallet', short: 'Not enough money in the wallet' },
  { long: 'Wrong PIN entered', short: 'Wrong PIN entered' },
  { long: 'The card was declined by the bank', short: 'Card declined by the bank' },
]

/** Red-headed card explaining a failed payment; the seats stay held while the timer runs. */
export function PaymentFailedCard({ seatsLabel, secondsLeft }: { seatsLabel: string; secondsLeft: number | null }) {
  return (
    <section aria-labelledby="pf-h" className="overflow-hidden rounded-[18px] border border-line bg-surface md:rounded-[20px]">
      <div className="flex items-center gap-3 bg-danger px-4 py-4 text-white md:px-7 md:py-[18px]">
        <StatusMark ok={false} size={32} tone="#CF0921" />
        <Heading as="h1" size="lg" id="pf-h" className="text-[22px] md:text-[28px]">
          Payment did not go through
        </Heading>
      </div>
      <div className="flex flex-col gap-4 p-4 md:px-7 md:py-6">
        <p className="m-0 md:text-[17px]">
          <strong>The prompt expired before it was approved.</strong> You have not been charged.
        </p>
        {secondsLeft !== null && secondsLeft > 0 && (
          <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-ink px-4 py-3.5 text-white">
            <span>
              {seatsLabel} {seatsLabel.startsWith('Seats') ? 'are' : 'is'} still held for you
            </span>
            <span className="font-mono font-semibold text-gold">{mmss(secondsLeft)}</span>
          </div>
        )}
        <div>
          <h2 className="m-0 mb-2 text-base font-semibold">Common reasons</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-muted">
            {reasons.map((r) => (
              <li key={r.long}>
                <span className="lg:hidden">{r.short}</span>
                <span className="hidden lg:inline">{r.long}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
