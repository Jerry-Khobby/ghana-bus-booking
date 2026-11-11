import { retryServer, useServerStatus } from '@/api/serverStatus'
import { Spinner } from '@/components/atoms'

/**
 * A slim bar across the top of every page while the server is starting, or
 * if it can't be reached. Pages that don't need data stay usable under it.
 */
export function ServerBanner() {
  const status = useServerStatus()
  if (status !== 'waking' && status !== 'down') return null
  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-50 bg-held px-4 py-2.5 text-held-ink">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center text-sm">
        {status === 'waking' ? (
          <>
            <Spinner size={16} tone="current" />
            <span>
              <strong>Starting Seatline’s server.</strong> It sleeps when idle, so this first load can take up to a minute.
            </span>
          </>
        ) : (
          <>
            <span>
              <strong>We can’t reach Seatline’s server.</strong> Check your connection, or try again in a moment.
            </span>
            <button
              type="button"
              onClick={retryServer}
              className="min-h-9 cursor-pointer rounded-lg border-2 border-held-ink bg-transparent px-3 font-semibold text-held-ink hover:bg-held-ink/10"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
