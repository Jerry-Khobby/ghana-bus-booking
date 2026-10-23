import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '@/components/atoms'
import { cx } from '@/lib/format'

interface MobileTopBarProps {
  back: { to: string; label: string }
  title: string
  subtitle?: string
  /** Badge or action at the right edge. */
  trailing?: ReactNode
  tone?: 'light' | 'dark'
  /** Centre the title, as on the phone results header. */
  centered?: boolean
  /** Render the title as the page's h1 (default) or as plain text. */
  asHeading?: boolean
}

/** Phone header: back arrow, title and subtitle, with an optional badge or action. */
export function MobileTopBar({ back, title, subtitle, trailing, tone = 'light', centered, asHeading = true }: MobileTopBarProps) {
  const dark = tone === 'dark'
  const TitleTag = asHeading ? 'h1' : 'p'
  return (
    <header className={cx('flex items-center gap-1.5 px-3 py-2', dark ? 'bg-ink text-white' : 'border-b border-line bg-surface text-ink')}>
      <Link
        to={back.to}
        aria-label={back.label}
        className={cx('flex size-11 shrink-0 items-center justify-center rounded-[10px] no-underline', dark ? 'text-white hover:text-on-dark' : 'text-ink hover:text-brand')}
      >
        <Icon name="back" size={22} />
      </Link>
      <div className={cx('min-w-0 flex-1', centered && 'text-center')}>
        <TitleTag className="m-0 truncate font-display text-[19px] font-extrabold leading-tight">{title}</TitleTag>
        {subtitle && <p className={cx('m-0 truncate text-[13px]', dark ? 'text-on-dark' : 'text-muted')}>{subtitle}</p>}
      </div>
      {trailing && <div className="flex shrink-0 items-center">{trailing}</div>}
      {centered && !trailing && <div className="size-11 shrink-0" aria-hidden="true" />}
    </header>
  )
}
