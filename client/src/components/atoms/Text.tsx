import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

/** Small uppercase label used for legends and card headings. */
export function Eyebrow({
  as: Tag = 'p',
  className,
  children,
  id,
}: {
  as?: 'p' | 'h2' | 'h3' | 'span' | 'legend'
  className?: string
  children: ReactNode
  id?: string
}) {
  return (
    <Tag id={id} className={cx('m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted', className)}>
      {children}
    </Tag>
  )
}

type HeadingSize = 'hero' | 'xl' | 'lg' | 'md' | 'sm'

const headingSizes: Record<HeadingSize, string> = {
  hero: 'text-[34px] leading-[1.05] md:text-[46px] md:leading-[1.04] lg:text-[60px] lg:leading-[1.02] tracking-[-0.03em] font-extrabold',
  xl: 'text-[28px] sm:text-[34px] tracking-[-0.02em] font-extrabold',
  lg: 'text-2xl sm:text-[30px] tracking-[-0.02em] font-extrabold',
  md: 'text-[22px] font-bold',
  sm: 'text-xl font-bold',
}

export function Heading({
  as: Tag = 'h2',
  size = 'lg',
  className,
  children,
  id,
}: {
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div'
  size?: HeadingSize
  className?: string
  children: ReactNode
  id?: string
}) {
  return (
    <Tag id={id} className={cx('m-0 font-display', headingSizes[size], className)}>
      {children}
    </Tag>
  )
}

/** Monospace text for plates, seat numbers and ticket codes. */
export function Mono({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cx('font-mono', className)}>{children}</span>
}
