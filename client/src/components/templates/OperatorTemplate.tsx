import type { ReactNode } from 'react'
import { OperatorNav } from '@/components/organisms'

interface OperatorTemplateProps {
  /** Shown in the phone top bar. */
  title: string
  /** Shown after the operator name in the phone top bar, e.g. "fleet". */
  context?: string
  /** Phone top bar shows a back arrow instead of the menu, e.g. on the layout editor. */
  back?: { to: string; label: string }
  children: ReactNode
  /** Sticky actions pinned to the bottom on phones, e.g. "New trip". */
  mobileAction?: ReactNode
}

export function OperatorTemplate({ title, context, back, children, mobileAction }: OperatorTemplateProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <OperatorNav operator="Coastline Express" title={title} context={context} back={back} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex flex-1 flex-col gap-4 px-4 pb-12 pt-4 md:gap-[18px] md:px-[22px] md:pt-[22px] lg:gap-6 lg:px-7 lg:pt-7">
          {children}
        </main>
        {mobileAction && (
          <div className="sticky bottom-0 z-20 border-t border-line bg-surface px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(22,32,28,0.10)] md:hidden">
            {mobileAction}
          </div>
        )}
      </div>
    </div>
  )
}
