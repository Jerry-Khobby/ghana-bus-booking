import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { getWalkInPayment, sellWalkIn } from '@/api/agent'
import type { ApiMomoNetwork } from '@/api/booking'
import { hhmm, pesewasToCedis } from '@/api/catalog'
import { errorMessage, isApiError } from '@/api/client'
import { useAuth } from '@/app/AuthContext'
import { useStation } from '@/app/StationContext'
import { Button, Card, Heading } from '@/components/atoms'
import { LoadState, PageHeader } from '@/components/molecules'
import { WalkInActions, WalkInForm, WalkInPreview, type WalkInDraft, type WalkInErrors, type WalkInTrip } from '@/components/organisms'
import { AgentTemplate } from '@/components/templates'
import type { MomoNetwork } from '@/data/types'
import { bySeat, plural } from '@/lib/format'

const NETWORKS: Record<MomoNetwork, ApiMomoNetwork> = { MTN: 'MTN', Telecel: 'TELECEL', AT: 'AIRTELTIGO' }

export function WalkInPage() {
  return (
    <AgentTemplate layout="stack" back={{ to: '/agent', label: 'Back to loading console', title: 'Walk-in sale' }}>
      <WalkIn />
    </AgentTemplate>
  )
}

function WalkIn() {
  const { console: consoleQuery } = useStation()
  const { staff } = useAuth()
  const navigate = useNavigate()
  const data = consoleQuery.data
  const freeSeats = (data?.seats ?? []).filter((s) => s.status === 'AVAILABLE').map((s) => s.label).sort(bySeat)
  const [draft, setDraft] = useState<WalkInDraft>({
    seat: '',
    name: '',
    phone: '',
    email: '',
    momoPhone: '',
    network: 'MTN',
    payment: 'cash',
    print: true,
  })
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<WalkInErrors>({})
  const [problem, setProblem] = useState<string | null>(null)
  // A mobile money sale waiting for the passenger to approve
  const [waiting, setWaiting] = useState<{ paymentId: string; seat: string; code: string } | null>(null)

  // The lowest free seat, until the agent picks another (or it goes)
  const seat = draft.seat && freeSeats.includes(draft.seat) ? draft.seat : (freeSeats[0] ?? '')

  if (!data) {
    return (
      <Card>
        <LoadState pending={consoleQuery.isPending} error={consoleQuery.error} onRetry={() => void consoleQuery.refetch()} label="Loading the bus…" />
      </Card>
    )
  }
  const trip = data.trip
  // Nothing to sell: no bus loading at this bay, or it is full
  if (!waiting && (!trip || trip.status !== 'LOADING' || freeSeats.length === 0)) return <Navigate to="/agent" replace />
  if (waiting) {
    return <MomoWaiting {...waiting} onDone={(ok) => (ok ? navigate('/agent', { state: { sold: waiting.seat, payment: 'momo', code: waiting.code } }) : setWaiting(null))} />
  }

  const t = trip!
  const fare = pesewasToCedis(t.farePesewas)
  const preview: WalkInTrip = {
    from: t.route.origin.city,
    to: t.route.destination.city,
    plate: t.bus.plate,
    bay: data.bay.number,
    fare,
    leaves: t.mode === 'FIXED_TIME' ? `departs ${hhmm(t.departureAt)}` : 'leaves when full',
  }
  const agent = staff?.name ?? ''

  async function issue() {
    setBusy(true)
    setErrors({})
    setProblem(null)
    try {
      const momo = draft.payment === 'momo'
      const res = await sellWalkIn(t.id, {
        seatLabel: seat || undefined,
        passengerName: draft.name.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        email: draft.email.trim() || undefined,
        method: momo ? 'MOMO' : 'CASH',
        ...(momo && { momoPhone: draft.momoPhone.trim(), network: NETWORKS[draft.network] }),
      })
      await consoleQuery.refetch()
      if (res.payment) {
        setWaiting({ paymentId: res.payment.paymentId, seat: res.seatLabel, code: res.bookingCode })
        return
      }
      if (draft.print) window.open(res.ticketUrl, '_blank', 'noopener')
      navigate('/agent', { state: { sold: res.booking.seatLabel, payment: 'cash', code: res.booking.code } })
    } catch (error) {
      if (isApiError(error, 'INVALID_PHONE')) setErrors({ phone: error.message })
      else if (isApiError(error, 'NETWORK_MISMATCH')) setErrors({ momoPhone: error.message })
      else if (isApiError(error, 'VALIDATION_FAILED') && error.fields.email) setErrors({ email: 'Enter a valid email address' })
      else if (isApiError(error, 'VALIDATION_FAILED') && error.fields.momoPhone) setErrors({ momoPhone: 'Enter the mobile money number' })
      else setProblem(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        back={{ to: '/agent', label: 'Loading console' }}
        backFromTablet
        title="Sell a walk-in seat"
        subtitle={`${preview.from} → ${preview.to} · ${t.bus.plate} · bay ${data.bay.number} · ${plural(freeSeats.length, 'seat')} left`}
      />
      <div className="lg:hidden">
        <WalkInPreview variant="strip" trip={preview} seat={seat} payment={draft.payment} agent={agent} />
      </div>
      {problem && (
        <p role="alert" className="m-0 rounded-xl border border-danger px-4 py-3 text-sm font-semibold text-danger">
          {problem}
        </p>
      )}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <WalkInForm
          freeSeats={freeSeats}
          fare={fare}
          draft={{ ...draft, seat }}
          onChange={setDraft}
          onSubmit={issue}
          errors={errors}
          busy={busy}
        />
        <div className="hidden lg:flex">
          <WalkInPreview variant="card" trip={preview} seat={seat} payment={draft.payment} agent={agent} />
        </div>
      </div>
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(22,32,28,0.10)] sm:-mx-6 sm:px-6 lg:hidden">
        <WalkInActions payment={draft.payment} busy={busy} />
      </div>
    </>
  )
}

/** The passenger has a prompt on their phone; the seat is held until they approve. */
function MomoWaiting({ paymentId, seat, code, onDone }: { paymentId: string; seat: string; code: string; onDone: (ok: boolean) => void }) {
  const payment = useQuery({
    queryKey: ['agent', 'payments', paymentId],
    queryFn: () => getWalkInPayment(paymentId),
    refetchInterval: (q) => (q.state.data && ['SUCCESS', 'FAILED', 'ABANDONED'].includes(q.state.data.status) ? false : 3_000),
  })
  const status = payment.data?.status
  useEffect(() => {
    if (status === 'SUCCESS') onDone(true)
  }, [status, onDone])

  const failed = status === 'FAILED' || status === 'ABANDONED'
  return (
    <Card className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Heading as="h1" size="lg">
        {failed ? 'The payment did not go through' : `Seat ${seat}: waiting for the passenger to approve`}
      </Heading>
      <p className="m-0 text-muted">
        {failed
          ? `${payment.data?.failureMessage ?? 'Not approved.'} The seat goes back on sale.`
          : `${payment.data?.displayText ?? 'A prompt is on their phone.'} Ask them to enter their PIN. Ticket ${code} is issued once it goes through.`}
      </p>
      {failed ? (
        <Button onClick={() => onDone(false)}>Back to the sale</Button>
      ) : (
        <LoadState pending label="Waiting for approval…" />
      )}
    </Card>
  )
}
