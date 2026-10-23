import type { ReactNode } from 'react'
import { useAuth } from '@/app/AuthContext'
import { AgentHeader } from '@/components/organisms'
import { cx } from '@/lib/format'

interface AgentTemplateProps {
  children: ReactNode
  /** Sub-pages (walk-in sale) show a back arrow on phones. */
  back?: { to: string; label: string; title: string }
  /** `split` puts the main card and sidebar side by side on desktop; `stack` is a single column. */
  layout?: 'split' | 'stack'
}

export function AgentTemplate({ children, back, layout = 'split' }: AgentTemplateProps) {
  const { staff } = useAuth()
  return (
    <div className="min-h-screen">
      <AgentHeader station="Accra — Circle station" agent={staff?.role === 'agent' ? staff.name : 'Kofi A.'} back={back} />
      <main
        className={cx(
          'mx-auto flex max-w-[1200px] flex-col gap-4 px-4 pb-16 pt-4 sm:px-6 md:gap-[18px] md:pt-5 lg:pt-7',
          layout === 'split' && 'lg:flex-row lg:items-start lg:gap-6',
        )}
      >
        {children}
      </main>
    </div>
  )
}
