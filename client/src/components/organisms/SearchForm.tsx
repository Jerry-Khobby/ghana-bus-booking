import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useBooking } from '@/app/BookingContext'
import { Button, Dropdown, Icon, TextInput, type DropdownOption } from '@/components/atoms'
import { FormField } from '@/components/molecules'
import { MAX_SEATS } from '@/lib/seats'

type When = 'today' | 'tomorrow' | 'pick'

const whenOptions: DropdownOption<When>[] = [
  { value: 'today', label: 'Today — leaving now' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'pick', label: 'Pick a date' },
]

const paxOptions: DropdownOption<string>[] = Array.from({ length: MAX_SEATS }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} passenger${i === 0 ? '' : 's'}`,
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
      className="-mt-16 grid grid-cols-1 items-end gap-4 rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_32px_rgba(22,32,28,0.10)] sm:grid-cols-2 sm:p-6 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
    >
      <FormField id="from" label="From">
        <TextInput id="from" value={from} onChange={(e) => setFrom(e.target.value)} />
      </FormField>
      <FormField id="to" label="To">
        <TextInput id="to" value={to} onChange={(e) => setTo(e.target.value)} />
      </FormField>
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
        <div className="sm:col-span-2 lg:order-last lg:col-span-2">
          <FormField id="date" label="Travel date">
            <TextInput id="date" type="date" min={isoDate(0)} value={date} onChange={(e) => setDate(e.target.value)} required />
          </FormField>
        </div>
      )}
      <Button type="submit" className="rounded-[10px] sm:col-span-2 lg:col-span-1 lg:min-w-[190px]" icon={<Icon name="search" size={18} />}>
        Find buses
      </Button>
    </form>
  )
}
