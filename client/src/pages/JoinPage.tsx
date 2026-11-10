import { useState, type FormEvent } from 'react'
import { errorMessage, isApiError } from '@/api/client'
import { applyToJoin } from '@/api/platform'
import { Button, ButtonLink, Heading, TextArea, TextInput } from '@/components/atoms'
import { FormField } from '@/components/molecules'
import { PublicTemplate } from '@/components/templates'

const benefits = [
  ['Sell seats online', 'Passengers find your buses, pick a seat and pay with mobile money or card.'],
  ['Run the station from a phone', 'Your agents sell walk-in seats and scan QR tickets at the bus door.'],
  ['See every cedi', 'Sales, seat fill and cash held by each agent, day by day.'],
] as const

/** /join: a bus company asks to come onto Seatline. A platform admin reviews it. */
export function JoinPage() {
  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', city: '', fleetSize: '', message: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ field?: string; text: string } | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await applyToJoin({
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        ...(form.fleetSize && { fleetSize: Number(form.fleetSize) }),
        ...(form.message.trim() && { message: form.message.trim() }),
        ...(form.website && { website: form.website }),
      })
      setSentTo(form.email.trim())
    } catch (err) {
      if (isApiError(err, 'INVALID_PHONE')) setError({ field: 'phone', text: errorMessage(err) })
      else setError({ text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicTemplate>
      <div className="flex flex-col gap-8 py-8 md:py-12 lg:flex-row lg:items-start lg:gap-14">
        <section aria-labelledby="join-h" className="flex flex-col gap-5 lg:max-w-[420px] lg:pt-4">
          <Heading as="h1" size="xl" id="join-h">
            Run a bus company? Join Seatline
          </Heading>
          <p className="m-0 text-[17px] text-muted">Tell us about your company. We review every application and email you within two working days.</p>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {benefits.map(([title, body]) => (
              <li key={title} className="border-l-4 border-brand pl-4">
                <p className="m-0 font-semibold">{title}</p>
                <p className="m-0 text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface p-4 md:p-7">
          {sentTo ? (
            <div role="status" className="flex flex-col items-start gap-3">
              <Heading as="h2" size="md">
                Application sent
              </Heading>
              <p className="m-0">
                Thank you. We've emailed <strong>{sentTo}</strong> to confirm we have it. Once we approve it, the same address gets a link to set your
                password and start adding buses and routes.
              </p>
              <ButtonLink to="/" variant="outline">
                Back to home
              </ButtonLink>
            </div>
          ) : (
            <form aria-label="Apply to join Seatline" onSubmit={submit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField id="jn-company" label="Company name">
                  <TextInput id="jn-company" required minLength={2} maxLength={80} autoComplete="organization" value={form.companyName} onChange={set('companyName')} />
                </FormField>
                <FormField id="jn-city" label="Where your buses load" hint="Town or city, e.g. Kumasi">
                  <TextInput id="jn-city" required minLength={2} maxLength={60} value={form.city} onChange={set('city')} />
                </FormField>
                <FormField id="jn-name" label="Your name" hint="You'll run the company on Seatline">
                  <TextInput id="jn-name" required minLength={2} maxLength={80} autoComplete="name" value={form.contactName} onChange={set('contactName')} />
                </FormField>
                <FormField id="jn-email" label="Email">
                  <TextInput id="jn-email" type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={set('email')} />
                </FormField>
                <FormField id="jn-phone" label="Phone" error={error?.field === 'phone' ? error.text : undefined}>
                  <TextInput
                    id="jn-phone"
                    type="tel"
                    inputMode="tel"
                    required
                    maxLength={20}
                    autoComplete="tel"
                    placeholder="024 000 0000"
                    aria-invalid={error?.field === 'phone' || undefined}
                    value={form.phone}
                    onChange={set('phone')}
                  />
                </FormField>
                <FormField id="jn-fleet" label="Number of buses (optional)">
                  <TextInput id="jn-fleet" type="number" inputMode="numeric" min={1} max={5000} value={form.fleetSize} onChange={set('fleetSize')} />
                </FormField>
              </div>
              <FormField id="jn-message" label="Anything else (optional)" hint="Your routes, stations, or how you sell tickets today">
                <TextArea id="jn-message" maxLength={1000} value={form.message} onChange={set('message')} />
              </FormField>
              {/* Bots fill every field; people never see this one */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label htmlFor="jn-website">Website</label>
                <input id="jn-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
              </div>
              {error && !error.field && (
                <p role="alert" className="m-0 text-sm font-semibold text-danger">
                  {error.text}
                </p>
              )}
              <Button type="submit" size="lg" className="self-start" disabled={busy} aria-busy={busy}>
                {busy ? 'Sending…' : 'Send application'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </PublicTemplate>
  )
}
