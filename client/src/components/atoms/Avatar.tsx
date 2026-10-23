import { cx } from '@/lib/format'

/** Gold circle with initials, for the signed-in passenger. Decorative: the name sits beside it. */
export function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full bg-gold font-bold text-gold-ink',
        size === 'md' ? 'size-9' : 'size-8 text-sm',
      )}
    >
      {initials}
    </span>
  )
}
