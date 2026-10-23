import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '@/app/AuthContext'
import { useStation } from '@/app/StationContext'
import { PageHeader } from '@/components/molecules'
import { WalkInActions, WalkInForm, WalkInPreview, type WalkInDraft } from '@/components/organisms'
import { AgentTemplate } from '@/components/templates'
import { findTrip } from '@/data/mock'
import { plural } from '@/lib/format'

export function WalkInPage() {
  const station = useStation()
  const { staff } = useAuth()
  const navigate = useNavigate()
  const trip = findTrip(station.tripId ?? undefined)
  const [draft, setDraft] = useState<WalkInDraft>(() => ({
    seat: station.freeSeats[0] ?? 0,
    name: '',
    phone: '',
    momoPhone: '',
    payment: 'cash',
    print: true,
  }))

  // Nothing to sell: no bus at this bay, it has left, or it is full.
  if (!trip || station.departed || station.freeSeats.length === 0) return <Navigate to="/agent" replace />

  const agent = staff?.role === 'agent' ? staff.name : 'Kofi A.'

  function issue() {
    station.sellWalkIn({
      seat: draft.seat,
      name: draft.name,
      phone: draft.payment === 'momo' ? draft.momoPhone : draft.phone,
      payment: draft.payment,
      printed: draft.print,
    })
    navigate('/agent', { state: { sold: draft.seat, payment: draft.payment } })
  }

  return (
    <AgentTemplate layout="stack" back={{ to: '/agent', label: 'Back to loading console' }}>
      <PageHeader
        back={{ to: '/agent', label: 'Loading console' }}
        title="Sell a walk-in seat"
        subtitle={`${trip.from.city} → ${trip.to.city} · ${trip.plate} · bay ${trip.bay} · ${plural(station.freeSeats.length, 'seat')} left`}
      />
      <div className="lg:hidden">
        <WalkInPreview variant="strip" trip={trip} seat={draft.seat} payment={draft.payment} agent={agent} />
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <WalkInForm freeSeats={station.freeSeats} fare={trip.fare} draft={draft} onChange={setDraft} onSubmit={issue} />
        <div className="hidden lg:flex">
          <WalkInPreview variant="card" trip={trip} seat={draft.seat} payment={draft.payment} agent={agent} />
        </div>
      </div>
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(22,32,28,0.10)] sm:-mx-6 sm:px-6 lg:hidden">
        <WalkInActions payment={draft.payment} />
      </div>
    </AgentTemplate>
  )
}
