import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

export type BadgeTone = 'loading' | 'scheduled' | 'full' | 'departed' | 'valid' | 'chip' | 'held'

const tones: Record<BadgeTone, string> = {
  loading: 'bg-gold text-gold-ink',
  scheduled: 'bg-surface border border-ink text-ink',
  full: 'bg-ink text-white',
  departed: 'bg-sunken text-taken-ink',
  valid: 'bg-brand-tint text-brand-ink',
  chip: 'bg-ink-soft text-on-dark font-normal',
  held: 'rounded-md border border-dashed border-held-line bg-held text-held-ink',
}

interface BadgeProps {
  tone: BadgeTone
  /** Show a small "live" dot before the text. */
  dot?: boolean
  size?: 'sm' | 'md'
  className?: string
  children: ReactNode
}

export function Badge({ tone, dot, size = 'md', className, children }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-full font-semibold',
        size === 'md' ? 'px-2.5 py-1 text-[13px]' : 'px-[9px] py-[3px] text-xs',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-2 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  )
}
