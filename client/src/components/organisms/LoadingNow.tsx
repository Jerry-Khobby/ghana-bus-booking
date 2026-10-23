import { Heading } from '@/components/atoms'
import { TripCard } from '@/components/molecules'
import type { Trip } from '@/data/types'

/** Phones: a sideways-scrolling row. Tablets: two columns. Desktop: three. */
export function LoadingNow({ trips }: { trips: Trip[] }) {
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
      <ul
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
