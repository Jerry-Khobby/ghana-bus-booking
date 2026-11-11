import { useServerStatus } from '@/api/serverStatus'
import { LogoMark, Spinner } from '@/components/atoms'

/**
 * The whole-screen wait: while a page's code downloads on first load, and
 * while a staff area checks the saved sign-in. Says when the server is
 * still starting, so a minute's wait doesn't look like a broken site.
 */
export function AppLoading({ label = 'Loading Seatline…' }: { label?: string }) {
  const server = useServerStatus()
  const waking = server === 'waking'
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <LogoMark size={48} />
      <div className="flex items-center gap-3">
        <Spinner />
        <p className="m-0 font-display text-lg font-bold text-ink">{waking ? 'Starting Seatline…' : label}</p>
      </div>
      {waking && (
        <p className="m-0 max-w-[40ch] text-[15px] text-muted">
          Our server sleeps when nobody has used it for a while. Waking it takes up to a minute, then everything is quick.
        </p>
      )}
    </div>
  )
}
