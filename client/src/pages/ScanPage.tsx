import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { boardTicket, scanTicket, type ApiScan } from '@/api/agent'
import { errorMessage } from '@/api/client'
import { useStation } from '@/app/StationContext'
import { Badge, Button, TextInput } from '@/components/atoms'
import { InvalidScan, ScanViewfinder, ValidScan } from '@/components/organisms'
import { PassTemplate, RequireAgent } from '@/components/templates'

/** Full-screen scanner: staff only, like the console, but in its own dark frame. */
export function ScanPage() {
  return (
    <RequireAgent>
      <Scanner />
    </RequireAgent>
  )
}

function Scanner() {
  const { console: consoleQuery } = useStation()
  const data = consoleQuery.data
  const trip = data?.trip
  const [scan, setScan] = useState<ApiScan | null>(null)
  const [checking, setChecking] = useState(false)
  const [boarding, setBoarding] = useState(false)
  const [boarded, setBoarded] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [typed, setTyped] = useState('')

  async function check(read: { qrPayload: string } | { code: string }) {
    if (!trip) return
    setChecking(true)
    setProblem(null)
    setBoarded(false)
    try {
      setScan(await scanTicket(trip.id, read))
    } catch (error) {
      setProblem(errorMessage(error))
    } finally {
      setChecking(false)
    }
  }

  async function board() {
    if (!scan?.ticket) return
    setBoarding(true)
    setProblem(null)
    try {
      await boardTicket(scan.ticket.code)
      setBoarded(true)
      void consoleQuery.refetch()
    } catch (error) {
      setProblem(errorMessage(error))
    } finally {
      setBoarding(false)
    }
  }

  function next() {
    setScan(null)
    setBoarded(false)
    setProblem(null)
    setTyped('')
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault()
    if (typed.trim()) void check({ code: typed.trim().toUpperCase() })
  }

  // Waiting for a result, or showing one: the camera holds still
  const paused = checking || !!scan

  return (
    <PassTemplate tone="dark">
      <div className="flex items-center justify-between gap-3">
        <Link to="/agent" className="inline-flex min-h-11 items-center font-semibold text-white no-underline hover:text-on-dark">
          ← Console
        </Link>
        {data && <Badge tone="chip">Bay {data.bay.number}{trip ? ` · ${trip.bus.plate}` : ''}</Badge>}
      </div>

      {!trip ? (
        <p className="m-0 rounded-xl bg-ink-soft p-4 text-on-dark">
          {data ? 'No bus is loading at this bay, so there is nothing to board.' : 'Loading your bay…'}
        </p>
      ) : (
        <>
          <ScanViewfinder paused={paused} onRead={(qrPayload) => void check({ qrPayload })} />

          <form onSubmit={submitTyped} className="flex gap-2">
            <TextInput
              aria-label="Ticket code"
              placeholder="Or type the code, e.g. SL-7Q4K-2M"
              className="font-mono uppercase"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <Button type="submit" variant="light" disabled={checking || !typed.trim()}>
              Check
            </Button>
          </form>

          {problem && (
            <p role="alert" className="m-0 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white">
              {problem}
            </p>
          )}

          {scan?.result === 'VALID' && scan.ticket && (
            <ValidScan
              passenger={scan.ticket.passengerName ?? 'Passenger'}
              code={scan.ticket.code}
              seat={scan.ticket.seatLabel}
              detail={`${trip.route.origin.city} → ${trip.route.destination.city} · this bus · ${scan.ticket.channel === 'ONLINE' ? 'paid online' : 'walk-in'}`}
              boarded={boarded}
              busy={boarding}
              onBoard={() => void board()}
            />
          )}
          {scan?.result === 'REJECTED' && (
            <InvalidScan
              reason={`${scan.message}${scan.ticket ? ` (${scan.ticket.code}, seat ${scan.ticket.seatLabel})` : ''}. Do not let the passenger board.`}
            />
          )}
          {scan && (
            <Button variant="light" size="lg" onClick={next}>
              Scan the next ticket
            </Button>
          )}
        </>
      )}
    </PassTemplate>
  )
}
