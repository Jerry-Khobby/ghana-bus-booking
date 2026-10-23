import { useOperator } from '@/app/OperatorContext'
import { ButtonLink } from '@/components/atoms'
import { PageHeader } from '@/components/molecules'
import { LayoutCard } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'

export function LayoutsPage() {
  const { layouts, buses } = useOperator()

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
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {layouts.map((l) => (
          <LayoutCard key={l.id} layout={l} busCount={buses.filter((b) => b.layoutId === l.id).length} />
        ))}
      </div>
    </OperatorTemplate>
  )
}
