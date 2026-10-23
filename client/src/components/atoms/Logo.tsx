import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#006B3D" />
      <rect x="8" y="8" width="16" height="12" rx="2" fill="none" stroke="#FFFFFF" strokeWidth="2" />
      <path d="M8 15h16" stroke="#FFFFFF" strokeWidth="2" />
      <circle cx="12" cy="23" r="1.6" fill="#FCD20F" />
      <circle cx="20" cy="23" r="1.6" fill="#FCD20F" />
    </svg>
  )
}

interface LogoProps {
  label?: ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export function Logo({ label = 'Seatline', size = 'md', className }: LogoProps) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <LogoMark size={size === 'md' ? 32 : 30} />
      <span
        className={cx(
          'font-display font-extrabold tracking-[-0.02em]',
          size === 'md' ? 'text-[22px]' : 'text-xl',
        )}
      >
        {label}
      </span>
    </span>
  )
}
