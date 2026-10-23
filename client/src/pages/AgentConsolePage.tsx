import { useLocation } from 'react-router'
import { useStation } from '@/app/StationContext'
import { Card, Heading } from '@/components/atoms'
import { InfoNote } from '@/components/molecules'
import { AgentSidebar, LoadingConsole } from '@/components/organisms'
import { AgentTemplate } from '@/components/templates'
import { bayQueue, findTrip } from '@/data/mock'

/** Set by the walk-in page when it returns here after a sale. */
interface SoldState {
  sold?: number
  payment?: 'cash' | 'momo'
}

export function AgentConsolePage() {
  const station = useStation()
  const trip = findTrip(station.tripId ?? undefined)
  const { state } = useLocation() as { state: SoldState | null }

  return (
    <AgentTemplate>
      {trip ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {state?.sold && (
              <InfoNote>
                <span role="status">
                  Seat {state.sold} sold to a walk-in passenger
                  {state.payment === 'cash' ? ' for cash' : ' by mobile money'}. Online buyers can no longer pick it.
                </span>
              </InfoNote>
            )}
            <LoadingConsole trip={trip} freeSeats={station.freeSeats} departed={station.departed} onDepart={station.markDeparted} />
          </div>
          <AgentSidebar scanned={station.scanned} notScanned={Math.max(0, station.sold - station.scanned)} bay={station.bay} queue={bayQueue} />
        </>
      ) : (
        <Card className="flex flex-1 flex-col gap-2">
          <Heading as="h1" size="lg">
            No bus loading on bay {station.bay}
          </Heading>
          <p className="m-0 text-muted">When the next bus pulls in, it appears here with its seat map and walk-in sales.</p>
        </Card>
      )}
    </AgentTemplate>
  )
}
