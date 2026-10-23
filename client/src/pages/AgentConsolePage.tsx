import { useState } from 'react'
import { Card, Heading } from '@/components/atoms'
import { AgentSidebar, LoadingConsole } from '@/components/organisms'
import { AgentTemplate } from '@/components/templates'
import { agentBays, bayQueue, findTrip } from '@/data/mock'

const SCANNED_ON_BOARD = 33

export function AgentConsolePage() {
  const bays = Object.keys(agentBays)
    .map(Number)
    .sort((a, b) => b - a)
  const [bay, setBay] = useState(bays[0])
  const trip = findTrip(agentBays[bay] ?? undefined)
  const [sold, setSold] = useState(41)
  const [departed, setDeparted] = useState(false)

  return (
    <AgentTemplate bays={bays} bay={bay} onBayChange={setBay}>
      {trip ? (
        <>
          <LoadingConsole
            trip={trip}
            sold={sold}
            departed={departed}
            onSellWalkIn={() => setSold((s) => Math.min(trip.capacity, s + 1))}
            onDepart={() => setDeparted(true)}
          />
          <AgentSidebar scanned={SCANNED_ON_BOARD} notScanned={sold - SCANNED_ON_BOARD} bay={bay} queue={bayQueue} />
        </>
      ) : (
        <Card className="flex flex-1 flex-col gap-2">
          <Heading as="h1" size="lg">
            No bus loading on bay {bay}
          </Heading>
          <p className="m-0 text-muted">When the next bus pulls in, it appears here with its seat map and walk-in sales.</p>
        </Card>
      )}
    </AgentTemplate>
  )
}
