import { Badge, Card, Eyebrow } from '@/components/atoms'

interface AgentSidebarProps {
  scanned: number
  notScanned: number
  bay: number
  queue: Array<{ plate: string; city: string; note: string; next: boolean }>
}

export function AgentSidebar({ scanned, notScanned, bay, queue }: AgentSidebarProps) {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[340px] lg:shrink-0">
      <Card as="section" aria-labelledby="board-h" className="!p-5">
        <Eyebrow as="h2" id="board-h" className="mb-3">
          Boarding
        </Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-tint p-3.5 text-brand-ink">
            <p className="m-0 font-display text-[30px] font-extrabold">{scanned}</p>
            <p className="m-0 text-sm">scanned on board</p>
          </div>
          <div className="rounded-xl bg-canvas p-3.5">
            <p className="m-0 font-display text-[30px] font-extrabold">{notScanned}</p>
            <p className="m-0 text-sm text-muted">sold, not yet scanned</p>
          </div>
        </div>
      </Card>

      <Card as="section" aria-labelledby="queue-h" className="!p-5">
        <Eyebrow as="h2" id="queue-h" className="mb-3">
          Next on bay {bay}
        </Eyebrow>
        <ol className="m-0 flex list-none flex-col p-0">
          {queue.map((q) => (
            <li key={q.plate} className="flex justify-between gap-3 border-b border-sunken py-3 last:border-b-0">
              <div>
                <p className="m-0 font-semibold">
                  {q.plate} · {q.city}
                </p>
                <p className="m-0 text-sm text-muted">{q.note}</p>
              </div>
              {q.next && (
                <Badge tone="scheduled" className="self-center">
                  Next
                </Badge>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </aside>
  )
}
