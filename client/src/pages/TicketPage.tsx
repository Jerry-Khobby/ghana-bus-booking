import { useQueries } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router'
import { getTicket } from '@/api/booking'
import { errorMessage, isApiError } from '@/api/client'
import { useBooking } from '@/app/BookingContext'
import { Button, ButtonLink, StatusMark } from '@/components/atoms'
import { TicketCard } from '@/components/organisms'
import { PassTemplate } from '@/components/templates'
import { plural } from '@/lib/format'
import { NotFoundPage } from './NotFoundPage'

function maskEmail(email: string) {
  const [user, domain] = email.split('@')
  if (!domain) return 'your email'
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`
}

/**
 * /ticket: the tickets just paid for. /ticket/:code: one ticket, opened from
 * the email (?t=), from My tickets (signed in), or on the device that bought
 * it (its saved link token).
 */
export function TicketPage() {
  const { code } = useParams()
  const [params] = useSearchParams()
  const { tickets: latest, history, email } = useBooking()

  const wanted = code
    ? [{ code, t: params.get('t') ?? history.find((h) => h.code === code)?.ticketToken ?? null }]
    : latest.map((t) => ({ code: t.code, t: t.ticketToken }))

  const results = useQueries({
    queries: wanted.map((w) => ({
      queryKey: ['tickets', w.code, w.t] as const,
      queryFn: () => getTicket(w.code, { t: w.t }),
      // The status moves (boarded, not used); keep it current while open
      refetchInterval: 60_000,
    })),
  })

  if (!wanted.length) {
    return <NotFoundPage title="No ticket to show" body="Your tickets are in your email, and in My tickets once you sign in." />
  }
  if (results.some((r) => r.isPending)) {
    return (
      <PassTemplate tone="brand">
        <p role="status" className="m-0 py-16 text-center text-white">
          Loading your ticket…
        </p>
      </PassTemplate>
    )
  }
  const failed = results.find((r) => r.isError)
  if (failed) {
    const expired = isApiError(failed.error, 'TOKEN_INVALID')
    return (
      <NotFoundPage
        title={expired ? 'This ticket link no longer works' : 'We could not find that ticket'}
        body={expired ? errorMessage(failed.error) : 'Check the link in your email, or open it from My tickets after signing in.'}
      />
    )
  }

  const tickets = results.map((r) => r.data!)
  const many = tickets.length > 1
  // Opened from a link or My tickets: the passenger already knows they are booked.
  const fromList = Boolean(code)

  return (
    <PassTemplate tone="brand">
      <div className="flex items-center gap-3 text-white">
        <StatusMark ok />
        <div>
          <h1 className="m-0 font-display text-2xl font-extrabold tracking-[-0.02em]">
            {fromList ? 'Your ticket' : many ? `You're booked · ${plural(tickets.length, 'seat')}` : "You're booked"}
          </h1>
          <p className="m-0 text-sm text-on-brand">
            {many ? 'One ticket per passenger. ' : ''}
            {fromList || !email ? 'Also in your email.' : `Also sent to ${maskEmail(email)}.`}
          </p>
        </div>
      </div>

      {many && (
        <p className="m-0 rounded-xl bg-brand-dark px-3.5 py-3 text-sm text-on-brand">
          Each QR code works once. Share each ticket with the person sitting in that seat, or show them one by one at the door.
        </p>
      )}

      {tickets.map((t, i) => (
        <TicketCard key={t.code} ticket={t} position={{ index: i, total: tickets.length }} />
      ))}

      <div className="grid grid-cols-2 gap-2.5 print:hidden">
        <Button variant="light" onClick={() => window.print()}>
          {many ? 'Save all as PDF' : 'Save as PDF'}
        </Button>
        <ButtonLink to={fromList ? '/tickets' : '/'} variant="outline-light">
          {fromList ? 'My tickets' : 'Done'}
        </ButtonLink>
      </div>
    </PassTemplate>
  )
}
