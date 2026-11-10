import { useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Icon } from '@/components/atoms'
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
  const dark = tone === 'dark'
  return (
    <div
      role="alert"
      className={cx(
        'flex flex-col items-center gap-3 rounded-2xl border px-6 py-8 text-center',
        dark ? 'border-white/20 bg-white/5' : 'border-line bg-surface',
        className,
      )}
    >
      <span className={cx('grid size-12 place-items-center rounded-full', dark ? 'bg-white/10 text-gold' : 'bg-held text-held-ink')}>
        <Icon name="alert" size={26} />
      </span>
      <p className={cx('m-0 font-display text-lg font-bold', dark ? 'text-white' : 'text-ink')}>{failedTitle(label)}</p>
      <p className={cx('m-0 max-w-[46ch] text-[15px]', muted)}>{errorMessage(error)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cx(
            'mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border-2 px-5 font-semibold',
            dark ? 'border-white bg-transparent text-white hover:bg-white/10' : 'border-ink bg-surface text-ink hover:bg-sunken',
          )}
        >
          <Icon name="refresh" size={18} />
          Try again
        </button>
      )}
    </div>
  )
}

/** "Loading applications…" → "Couldn't load applications". */
function failedTitle(label: string) {
  const what = /^Loading\s+(.+?)(…|\.\.\.)?$/i.exec(label)?.[1]
  return what ? `Couldn't load ${what}` : 'Something went wrong'
}
