import { Heading } from '@/components/atoms'
import { TripCard } from '@/components/molecules'
import type { Trip } from '@/data/types'

export function LoadingNow({ trips }: { trips: Trip[] }) {
  return (
    <section aria-labelledby="loading-h" className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Heading id="loading-h">Loading now</Heading>
        <p className="m-0 text-[15px] text-muted">Updates live as seats are sold</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:mt-5 lg:grid-cols-3 lg:gap-4 md:max-lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} />
        ))}
      </div>
    </section>
  )
}
