import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

/** Soft green reassurance note, e.g. "A seat you pick is held for 5 minutes". */
export function InfoNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('m-0 rounded-xl bg-brand-tint p-3.5 text-sm text-brand-ink', className)}>{children}</p>
}
