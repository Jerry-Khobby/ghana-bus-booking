import { useState } from 'react'
import { useLocation } from 'react-router'
import { departTrip, startLoading } from '@/api/agent'
import { errorMessage, isApiError } from '@/api/client'
import { useAuth } from '@/app/AuthContext'
import { useStation } from '@/app/StationContext'
import { Card, Heading } from '@/components/atoms'
import { InfoNote, LoadState } from '@/components/molecules'
import { AgentSidebar, LoadingConsole } from '@/components/organisms'
import { AgentTemplate } from '@/components/templates'

/** Set by the walk-in page when it returns here after a sale. */
interface SoldState {
  sold?: string
  payment?: 'cash' | 'momo'
  code?: string
}

export function AgentConsolePage() {
  return (
    <AgentTemplate>
      <Console />
    </AgentTemplate>
  )
}

function Console() {
  const { console: consoleQuery } = useStation()
  const { staff } = useAuth()
  const { state } = useLocation() as { state: SoldState | null }
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [departNote, setDepartNote] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const data = consoleQuery.data
  if (!data) {
    return (
      <Card className="flex-1">
        <LoadState
          pending={consoleQuery.isPending}
          error={consoleQuery.error}
          onRetry={() => void consoleQuery.refetch()}
          label="Loading your bay…"
        />
      </Card>
    )
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setProblem(null)
    try {
      await action()
      await consoleQuery.refetch()
    } catch (error) {
      setProblem(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const trip = data.trip
  const depart = (confirmUnboarded: boolean) =>
    run(async () => {
      try {
        const res = await departTrip(trip!.id, confirmUnboarded)
        setConfirm(null)
        setDepartNote(
          `${trip!.bus.plate} departed.${res.noShows ? ` ${res.noShows} ticket${res.noShows === 1 ? '' : 's'} marked not used.` : ''}`,
        )
      } catch (error) {
        if (isApiError(error, 'UNBOARDED_PASSENGERS')) {
          setConfirm(error.message)
          return
        }
        throw error
      }
    })

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {state?.sold && (
          <InfoNote>
            <span role="status">
              Seat {state.sold} sold to a walk-in passenger
              {state.payment === 'cash' ? ' for cash' : ' by mobile money'}
              {state.code ? ` · ticket ${state.code}` : ''}. Online buyers can no longer pick it.
            </span>
          </InfoNote>
        )}
        {departNote && (
          <InfoNote>
            <span role="status">{departNote}</span>
          </InfoNote>
        )}
        {problem && (
          <p role="alert" className="m-0 rounded-xl border border-danger px-4 py-3 text-sm font-semibold text-danger">
            {problem}
          </p>
        )}
        {trip && data.counts ? (
          <LoadingConsole
            trip={trip}
            counts={data.counts}
            seats={data.seats}
            operator={staff?.operator?.name}
            busy={busy}
            onStartLoading={() => void run(() => startLoading(trip.id))}
            onDepart={() => void depart(false)}
            confirmDepart={
              confirm ? { message: confirm, onConfirm: () => void depart(true), onCancel: () => setConfirm(null) } : null
            }
          />
        ) : (
          <Card className="flex flex-1 flex-col gap-2">
            <Heading as="h1" size="lg">
              No bus loading on bay {data.bay.number}
            </Heading>
            <p className="m-0 text-muted">
              {data.queue.length
                ? 'The next bus booked on this bay is listed alongside. It appears here when its time comes.'
                : 'No more buses are booked on this bay today.'}
            </p>
          </Card>
        )}
      </div>
      <AgentSidebar
        boarded={data.counts?.boarded ?? 0}
        notBoarded={Math.max(0, (data.counts?.sold ?? 0) - (data.counts?.boarded ?? 0))}
        bay={data.bay.number}
        queue={data.queue}
      />
    </>
  )
}
