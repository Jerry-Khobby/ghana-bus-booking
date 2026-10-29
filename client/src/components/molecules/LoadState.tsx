import { useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { cx } from '@/lib/format'

/** After this long, say why it's slow: the free server sleeps when idle. */
const SLOW_MS = 6_000

/**
 * "Loading…" that explains itself when it runs long, or the error with a
 * Try again button. `tone="dark"` sits on the green ticket page.
 */
export function LoadState({
  pending,
  error,
  onRetry,
  label = 'Loading…',
  tone = 'light',
  className,
}: {
  pending?: boolean
  error?: unknown
  onRetry?: () => void
  label?: string
  tone?: 'light' | 'dark'
  className?: string
}) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!pending) return
    setSlow(false)
    const id = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(id)
  }, [pending])

  const muted = tone === 'dark' ? 'text-on-brand' : 'text-muted'
  if (pending) {
    return (
      <div role="status" className={cx('flex flex-col items-center gap-1.5 p-6 text-center', className)}>
        <p className={cx('m-0 font-semibold', tone === 'dark' && 'text-white')}>{label}</p>
        {slow && <p className={cx('m-0 text-sm', muted)}>Still working: the server may be waking up. This can take up to a minute.</p>}
      </div>
    )
  }
  if (!error) return null
  return (
    <div role="alert" className={cx('flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-line-strong p-6 text-center', className)}>
      <p className={cx('m-0', tone === 'dark' ? 'text-white' : 'text-ink')}>{errorMessage(error)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 cursor-pointer rounded-[10px] border-2 border-ink bg-surface px-5 font-semibold text-ink hover:bg-sunken"
        >
          Try again
        </button>
      )}
    </div>
  )
}
