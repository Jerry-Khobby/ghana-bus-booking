import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

/** Narrow, phone-first page on a solid colour: the e-ticket (green) and the scanner (dark). */
export function PassTemplate({ tone, children }: { tone: 'brand' | 'dark'; children: ReactNode }) {
  return (
    <div className={cx('min-h-screen', tone === 'brand' ? 'bg-brand text-ink' : 'bg-ink text-white')}>
      <main className="mx-auto flex max-w-[440px] flex-col gap-4 px-4 pb-8 pt-4 sm:pt-6">{children}</main>
    </div>
  )
}
