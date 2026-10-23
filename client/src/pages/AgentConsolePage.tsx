import { useStation } from '@/app/StationContext'
import { Card, Heading } from '@/components/atoms'
import { AgentSidebar, LoadingConsole } from '@/components/organisms'
import { AgentTemplate } from '@/components/templates'
import { bayQueue, findTrip } from '@/data/mock'

export function AgentConsolePage() {
  const station = useStation()
  const trip = findTrip(station.tripId ?? undefined)

  return (
    <AgentTemplate>
      {trip ? (
        <>
          <LoadingConsole trip={trip} freeSeats={station.freeSeats} departed={station.departed} onDepart={station.markDeparted} />
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
