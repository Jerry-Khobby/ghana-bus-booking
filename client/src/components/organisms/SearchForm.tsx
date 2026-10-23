import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
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

function isoDate(offsetDays: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export function SearchForm() {
  const navigate = useNavigate()
  const { passengers, setPassengers } = useBooking()
  const [from, setFrom] = useState('Accra — Circle')
  const [to, setTo] = useState('Kumasi — Asafo')
  const [when, setWhen] = useState<When>('today')
  const [date, setDate] = useState(isoDate(2))

  function submit(e: FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({ from, to, when, pax: String(passengers) })
    if (when === 'pick') params.set('date', date)
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
          <TextInput id="from" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <FormField id="to" label="To">
          <TextInput id="to" value={to} onChange={(e) => setTo(e.target.value)} />
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
      <Button type="submit" className="col-span-2 min-h-[52px] rounded-[10px] lg:col-span-1 lg:min-h-12 lg:min-w-[190px]" icon={<Icon name="search" size={18} />}>
        Find buses
      </Button>
    </form>
  )
}
