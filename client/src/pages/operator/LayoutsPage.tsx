import { useLayouts } from '@/api/admin'
import { ButtonLink } from '@/components/atoms'
import { LoadState, PageHeader } from '@/components/molecules'
import { LayoutCard } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { fromCells } from '@/lib/seats'

export function LayoutsPage() {
  const layouts = useLayouts()

  return (
    <OperatorTemplate title="Seat layouts">
      <PageHeader
        title="Seat layouts"
        subtitle="Seat plans passengers pick from. Each bus uses one."
        action={
          <ButtonLink to="/operator/layouts/new" className="w-full md:w-auto">
            New layout
          </ButtonLink>
        }
      />
      {layouts.data ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {layouts.data.map((l) => (
            <LayoutCard
              key={l.id}
              layout={{ id: l.id, name: l.name, seats: l.seatCount, layout: fromCells(l.rows, l.cols, l.cells) }}
              busCount={l.busesUsing}
            />
          ))}
        </div>
      ) : (
        <LoadState pending={layouts.isPending} error={layouts.error} onRetry={() => void layouts.refetch()} label="Loading seat layouts…" />
      )}
    </OperatorTemplate>
  )
}
