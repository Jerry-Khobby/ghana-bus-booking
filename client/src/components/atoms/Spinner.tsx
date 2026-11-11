import { cx } from '@/lib/format'

/** A small turning ring. Still for people who ask for less motion. */
export function Spinner({ size = 20, tone = 'brand', className }: { size?: number; tone?: 'brand' | 'light' | 'current'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cx(
        'inline-block shrink-0 rounded-full border-2 motion-safe:animate-spin',
        tone === 'brand' ? 'border-brand/25 border-t-brand' : tone === 'light' ? 'border-white/30 border-t-white' : 'border-current border-r-transparent',
        className,
      )}
    />
  )
}
