import { useServerStatus } from '@/api/serverStatus'
import { Heading, Spinner } from '@/components/atoms'
import { TripCard } from '@/components/molecules'
import { cx } from '@/lib/format'
import type { Trip } from '@/data/types'

interface LoadingNowProps {
  trips: Trip[]
  /** First load still on its way. */
  pending?: boolean
  failed?: boolean
}

/** Phones: a sideways-scrolling row. Tablets: two columns. Desktop: three. */
export function LoadingNow({ trips, pending, failed }: LoadingNowProps) {
  const server = useServerStatus()
  const empty = pending
    ? null
    : failed
      ? 'Could not load the buses right now. Search above still works.'
      : trips.length === 0
        ? 'No buses are loading right now. Search for a later trip above.'
        : null
  return (
    <section aria-labelledby="loading-h" className="mt-9 md:mt-11 lg:mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Heading id="loading-h" className="text-2xl md:text-[28px] lg:text-[30px]">
          Loading now
        </Heading>
        <p className="m-0 text-[13px] text-muted md:hidden" aria-hidden="true">
          Swipe →
        </p>
        <p className="m-0 hidden text-sm text-muted md:block lg:text-[15px]">
          <span className="lg:hidden">Updates live</span>
          <span className="hidden lg:inline">Updates live as seats are sold</span>
        </p>
      </div>
      {pending && (
        <div role="status" aria-busy="true" className="mt-3 grid grid-cols-1 gap-3 md:mt-4 md:grid-cols-2 md:gap-3.5 lg:mt-5 lg:grid-cols-3 lg:gap-4">
          <span className="sr-only">Checking which buses are loading…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className={cx('h-46 rounded-2xl bg-sunken motion-safe:animate-pulse', i > 0 && 'hidden md:block', i > 1 && 'md:hidden lg:block')} />
          ))}
          {server === 'waking' && (
            <p className="m-0 flex items-center gap-2 text-sm text-muted md:col-span-2 lg:col-span-3">
              <Spinner size={14} />
              Starting Seatline’s server. It sleeps when idle, so this can take up to a minute.
            </p>
          )}
        </div>
      )}
      {empty && (
        <p role="status" className="m-0 mt-3 rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted md:mt-4">
          {empty}
        </p>
      )}
      <ul
        hidden={!!empty || pending}
        aria-label="Buses loading now"
        className="-mx-4 mt-3 flex list-none scroll-px-4 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:mt-4 md:grid md:snap-none md:grid-cols-2 md:gap-3.5 md:overflow-visible md:px-0 lg:mt-5 lg:grid-cols-3 lg:gap-4 md:max-lg:[&>*:last-child:nth-child(odd)]:col-span-2"
      >
        {trips.map((t) => (
          <li key={t.id} className="w-[260px] flex-none snap-start md:w-auto">
            <TripCard trip={t} />
          </li>
        ))}
      </ul>
    </section>
  )
}
