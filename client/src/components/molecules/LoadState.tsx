import { useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { useServerStatus } from '@/api/serverStatus'
import { Icon, Spinner } from '@/components/atoms'
import { cx } from '@/lib/format'

/** After this long, say why it's slow: the free server sleeps when idle. */
const SLOW_MS = 6_000

/**
 * A skeleton while loading, which explains itself when the server is waking
 * or it runs long, or the error with a Try again button. `tone="dark"` sits
 * on the green ticket page.
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
  const server = useServerStatus()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!pending) return
    setSlow(false)
    const id = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(id)
  }, [pending])

  const muted = tone === 'dark' ? 'text-on-brand' : 'text-muted'
  if (pending) {
    // Grey bars where the content will be, so the page holds its shape
    const bar = cx('rounded-lg motion-safe:animate-pulse', tone === 'dark' ? 'bg-white/15' : 'bg-sunken')
    return (
      <div role="status" aria-busy="true" className={cx('flex flex-col gap-3 py-2', className)}>
        <span className="sr-only">{label}</span>
        <div className={cx(bar, 'h-5 w-2/5')} />
        <div className={cx(bar, 'h-14 w-full')} />
        <div className={cx(bar, 'h-14 w-full')} />
        <div className={cx(bar, 'h-14 w-4/5')} />
        {(slow || server === 'waking') && (
          <p className={cx('m-0 flex items-center gap-2 text-sm', muted)}>
            <Spinner size={14} tone={tone === 'dark' ? 'light' : 'brand'} />
            Starting Seatline’s server. It sleeps when idle, so this can take up to a minute.
          </p>
        )}
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
