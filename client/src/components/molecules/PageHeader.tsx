import type { ReactNode } from 'react'
import { Heading } from '@/components/atoms'
import { cx } from '@/lib/format'
import { BackLink } from './BackLink'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Small line above the title, e.g. "Today". */
  eyebrow?: ReactNode
  back?: { to: string; label: string }
  /** The phone header already has a back arrow; hide the text link there. */
  backFromTablet?: boolean
  /** Main action at the right, e.g. a "New trip" button. */
  action?: ReactNode
}

/** Title block at the top of operator, agent and account pages. */
export function PageHeader({ title, subtitle, eyebrow, back, backFromTablet, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 md:gap-4">
      <div className="min-w-0">
        {back && (
          <div className={cx(backFromTablet && 'hidden md:block')}>
            <BackLink to={back.to}>{back.label}</BackLink>
          </div>
        )}
        {eyebrow && <p className="m-0 text-sm text-muted">{eyebrow}</p>}
        <Heading as="h1" size="xl" className={cx(back && (backFromTablet ? 'md:mt-1.5' : 'mt-1.5'))}>
          {title}
        </Heading>
        {subtitle && <p className="m-0 mt-0.5 text-[15px] text-muted md:text-base">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
