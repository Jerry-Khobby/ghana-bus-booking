import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useStations, type ApiStation } from '@/api/catalog'
import { useBooking } from '@/app/BookingContext'
import { Button, Dropdown, Icon, TextInput, type DropdownOption } from '@/components/atoms'
import { FormField } from '@/components/molecules'
import { MAX_SEATS } from '@/lib/seats'

type When = 'today' | 'tomorrow' | 'pick'

const whenOptions: DropdownOption<When>[] = [
  { value: 'today', label: 'Today — leaving now', short: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'pick', label: 'Pick a date' },
]

const paxOptions: DropdownOption<string>[] = Array.from({ length: MAX_SEATS }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} passenger${i === 0 ? '' : 's'}`,
  short: String(i + 1),
}))

/** YYYY-MM-DD, offset days from today. Ghana is on GMT, so the UTC day is the local day. */
export function isoDate(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

export const stationName = (s: Pick<ApiStation, 'city' | 'name'>) => `${s.city} — ${s.name}`

/** The busiest route, when the stations exist; else the first two. */
function defaultRoute(stations: ApiStation[]) {
  const find = (city: string) => stations.find((s) => s.city === city)
  const from = find('Accra') ?? stations[0]
  const to = find('Kumasi') ?? stations.find((s) => s.id !== from?.id)
  return { from: from?.id ?? '', to: to?.id ?? '' }
}

export function SearchForm() {
  const navigate = useNavigate()
  const { passengers, setPassengers } = useBooking()
  const stations = useStations()
  const [picked, setPicked] = useState<{ from?: string; to?: string }>({})
  const [when, setWhen] = useState<When>('today')
  const [date, setDate] = useState(isoDate(2))

  const list = stations.data ?? []
  const fallback = defaultRoute(list)
  const from = picked.from ?? fallback.from
  const to = picked.to ?? fallback.to
  const options: DropdownOption<string>[] = list.map((s) => ({ value: s.id, label: stationName(s), short: s.city }))
  const same = !!from && from === to

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!from || !to || same) return
    const day = when === 'today' ? isoDate(0) : when === 'tomorrow' ? isoDate(1) : date
    const params = new URLSearchParams({ from, to, date: day, pax: String(passengers) })
    navigate(`/trips?${params}`)
  }

  return (
    <form
      aria-label="Search buses"
      onSubmit={submit}
      className="-mt-[60px] grid grid-cols-2 items-end gap-x-2.5 gap-y-3.5 rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_32px_rgba(22,32,28,0.10)] sm:p-5 md:gap-3.5 lg:-mt-16 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:gap-4 lg:p-6"
    >
      {/* Phones: From and To full width, When and Passengers side by side. */}
      <div className="col-span-2 sm:col-span-1">
        <FormField id="from" label="From">
          {options.length ? (
            <Dropdown id="from" labelledBy="from-label" value={from} options={options} onChange={(v) => setPicked((p) => ({ ...p, from: v }))} />
          ) : stations.isError && !stations.isFetching ? (
            <button
              type="button"
              onClick={() => void stations.refetch()}
              className="h-[52px] cursor-pointer rounded-[10px] border border-dashed border-danger bg-surface px-3.5 text-left font-semibold text-danger"
            >
              Couldn't load stations · Try again
            </button>
          ) : (
            <TextInput id="from" disabled value="Loading stations…" readOnly />
          )}
        </FormField>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <FormField id="to" label="To" error={same ? 'Pick a different station' : undefined}>
          {options.length ? (
            <Dropdown id="to" labelledBy="to-label" value={to} options={options} onChange={(v) => setPicked((p) => ({ ...p, to: v }))} />
          ) : (
            <TextInput id="to" disabled value="" readOnly />
          )}
        </FormField>
      </div>
      <FormField id="when" label="When">
        <Dropdown id="when" labelledBy="when-label" value={when} options={whenOptions} onChange={setWhen} />
      </FormField>
      <FormField id="pax" label="Passengers">
        <Dropdown
          id="pax"
          labelledBy="pax-label"
          value={String(passengers)}
          options={paxOptions}
          onChange={(v) => setPassengers(Number(v))}
        />
      </FormField>
      {when === 'pick' && (
        <div className="col-span-2 lg:order-last">
          <FormField id="date" label="Travel date">
            <TextInput id="date" type="date" min={isoDate(0)} value={date} onChange={(e) => setDate(e.target.value)} required />
          </FormField>
        </div>
      )}
      <Button
        type="submit"
        disabled={!from || !to || same}
        className="col-span-2 min-h-[52px] rounded-[10px] lg:col-span-1 lg:min-h-12 lg:min-w-[190px]"
        icon={<Icon name="search" size={18} />}
      >
        Find buses
      </Button>
    </form>
  )
}
