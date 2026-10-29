import type { ApiQueuedTrip } from '@/api/agent'
import { hhmm } from '@/api/catalog'
import { Badge, Card, Eyebrow } from '@/components/atoms'

interface AgentSidebarProps {
  boarded: number
  /** Sold, not yet scanned on board. */
  notBoarded: number
  bay: number
  queue: ApiQueuedTrip[]
}

/** "Scheduled 14:30 · 27 sold online" */
function note(t: ApiQueuedTrip) {
  const when = t.mode === 'FIXED_TIME' ? `Scheduled ${hhmm(t.departureAt) ?? ''}` : `Fill-and-go · boards ${hhmm(t.loadingStartsAt) ?? ''}`
  const sold = t.counts.walkIn ? `${t.counts.sold} sold` : `${t.counts.online} sold online`
  return `${when.trim()} · ${sold}`
}

export function AgentSidebar({ boarded, notBoarded, bay, queue }: AgentSidebarProps) {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[340px] lg:shrink-0">
      <Card as="section" aria-labelledby="board-h" className="!p-5">
        <Eyebrow as="h2" id="board-h" className="mb-3">
          Boarding
        </Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-tint p-3.5 text-brand-ink">
            <p className="m-0 font-display text-[30px] font-extrabold">{boarded}</p>
            <p className="m-0 text-sm">scanned on board</p>
          </div>
          <div className="rounded-xl bg-canvas p-3.5">
            <p className="m-0 font-display text-[30px] font-extrabold">{notBoarded}</p>
            <p className="m-0 text-sm text-muted">sold, not yet scanned</p>
          </div>
        </div>
      </Card>

      <Card as="section" aria-labelledby="queue-h" className="!p-5">
        <Eyebrow as="h2" id="queue-h" className="mb-3">
          Next on bay {bay}
        </Eyebrow>
        {queue.length ? (
          <ol className="m-0 flex list-none flex-col p-0">
            {queue.map((q, i) => (
              <li key={q.id} className="flex justify-between gap-3 border-b border-sunken py-3 last:border-b-0">
                <div>
                  <p className="m-0 font-semibold">
                    {q.plate} · {q.destination.city}
                  </p>
                  <p className="m-0 text-sm text-muted">{note(q)}</p>
                </div>
                {i === 0 && (
                  <Badge tone="scheduled" className="self-center">
                    Next
                  </Badge>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-sm text-muted">No more buses booked on this bay today.</p>
        )}
      </Card>
    </aside>
  )
}
