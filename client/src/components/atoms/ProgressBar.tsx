import { cx } from '@/lib/format'

interface ProgressBarProps {
  /** 0–100 */
  value: number
  tone?: 'brand' | 'inactive'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const heights = { sm: 'h-2', md: 'h-2.5', lg: 'h-3.5' }

export function ProgressBar({ value, tone = 'brand', size = 'md', className, label }: ProgressBarProps) {
  return (
    <div
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuenow={label ? value : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      className={cx('overflow-hidden rounded-full bg-sunken', heights[size], className)}
    >
      <div
        className={cx('h-full transition-[width] duration-300', tone === 'brand' ? 'bg-brand' : 'bg-inactive')}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
