import type { ReactNode } from 'react'
import { Heading } from '@/components/atoms'
import { BackLink } from './BackLink'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  /** Small line above the title, e.g. "Today". */
  eyebrow?: string
  back?: { to: string; label: string }
  /** Main action at the right, e.g. a "New trip" button. */
  action?: ReactNode
}

/** Title block at the top of operator and account pages. */
export function PageHeader({ title, subtitle, eyebrow, back, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 md:gap-4">
      <div className="min-w-0">
        {back && <BackLink to={back.to}>{back.label}</BackLink>}
        {eyebrow && <p className="m-0 text-sm text-muted">{eyebrow}</p>}
        <Heading as="h1" size="xl" className={back ? 'mt-1.5' : undefined}>
          {title}
        </Heading>
        {subtitle && <p className="m-0 mt-0.5 text-[15px] text-muted md:text-base">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
