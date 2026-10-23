import type { HTMLAttributes } from 'react'
import { cx } from '@/lib/format'

type CardTone = 'surface' | 'dark' | 'tint' | 'sunken'

const tones: Record<CardTone, string> = {
  surface: 'bg-surface border border-line',
  dark: 'bg-ink text-white',
  tint: 'bg-brand-tint text-brand-ink',
  sunken: 'bg-canvas',
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside'
  tone?: CardTone
  radius?: 'md' | 'lg'
  padded?: boolean
}

export function Card({ as: Tag = 'div', tone = 'surface', radius = 'lg', padded = true, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(tones[tone], radius === 'lg' ? 'rounded-2xl' : 'rounded-[14px]', padded && 'p-5 sm:p-6', className)}
      {...rest}
    />
  )
}

export function Divider({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return <div aria-hidden="true" className={cx('h-px', tone === 'light' ? 'bg-line' : 'bg-ink-line')} />
}
