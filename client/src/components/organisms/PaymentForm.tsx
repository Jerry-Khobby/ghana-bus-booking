import type { FormEvent } from 'react'
import { Button, Eyebrow, TextInput } from '@/components/atoms'
import { FormField, OptionTile, SegmentedControl } from '@/components/molecules'
import type { MomoNetwork, PaymentMethod } from '@/data/types'
import { cedis } from '@/lib/format'
import { TEST_MOMO, testMomoHint } from '@/lib/testMode'

const networks: MomoNetwork[] = ['MTN', 'Telecel', 'AT']

export const PAYMENT_FORM_ID = 'payment-form'

/** Problems the server found with what was typed, by field. */
export interface PaymentFormErrors {
  phone?: string
  email?: string
  name?: string
  form?: string
}

interface PaymentFormProps {
  total: number
  method: PaymentMethod
  onMethodChange: (m: PaymentMethod) => void
  network: MomoNetwork
  onNetworkChange: (n: MomoNetwork) => void
  phone: string
  onPhoneChange: (p: string) => void
  email: string
  onEmailChange: (e: string) => void
  name: string
  onNameChange: (n: string) => void
  errors?: PaymentFormErrors
  onSubmit: () => void
  pending: boolean
}

export function PaymentForm(props: PaymentFormProps) {
  const errors = props.errors ?? {}
  function submit(e: FormEvent) {
    e.preventDefault()
    props.onSubmit()
  }

  return (
    <form
      id={PAYMENT_FORM_ID}
      aria-label="Payment"
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-line bg-surface p-3.5 md:gap-5 md:rounded-2xl md:p-[22px] lg:gap-[22px] lg:p-6"
    >
      <SegmentedControl
        label="Payment method"
        value={props.method}
        onChange={props.onMethodChange}
        options={[
          { value: 'momo', label: 'Mobile money' },
          { value: 'card', label: 'Card' },
        ]}
      />

      {props.method === 'momo' ? (
        <>
          <fieldset className="m-0 border-0 p-0">
            <Eyebrow as="legend" className="pb-2.5">
              Network
            </Eyebrow>
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              {networks.map((n) => (
                <OptionTile key={n} selected={props.network === n} onSelect={() => props.onNetworkChange(n)}>
                  {n}
                </OptionTile>
              ))}
            </div>
          </fieldset>
          <FormField
            id="phone"
            label="Mobile money number"
            hint={testMomoHint}
            error={errors.phone}
          >
            <TextInput
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={TEST_MOMO.number}
              inputSize="lg"
              mono
              required
              pattern="[0-9 +]{9,16}"
              title="A Ghana mobile number, e.g. 024 000 0000"
              aria-invalid={!!errors.phone || undefined}
              value={props.phone}
              onChange={(e) => props.onPhoneChange(e.target.value)}
            />
          </FormField>
        </>
      ) : (
        <p className="m-0 rounded-xl bg-canvas px-4 py-3 text-[15px] text-muted">
          You will enter your card on Paystack&apos;s secure page, then come straight back here. Seatline never sees your card details.
        </p>
      )}

      <FormField id="email" label="Email for your ticket" hint="We send the ticket and its QR code here." error={errors.email}>
        <TextInput
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          inputSize="lg"
          required
          maxLength={254}
          aria-invalid={!!errors.email || undefined}
          value={props.email}
          onChange={(e) => props.onEmailChange(e.target.value)}
        />
      </FormField>
      <FormField id="pname" label="Passenger name (optional)" hint="Printed on the ticket." error={errors.name}>
        <TextInput
          id="pname"
          autoComplete="name"
          maxLength={80}
          inputSize="lg"
          value={props.name}
          onChange={(e) => props.onNameChange(e.target.value)}
        />
      </FormField>

      {errors.form && (
        <p role="alert" className="m-0 rounded-xl border border-danger px-4 py-3 text-sm font-semibold text-danger">
          {errors.form}
        </p>
      )}

      {/* On phones the pay button lives in the sticky bar instead. */}
      <div className="hidden md:block">
        <PayButton total={props.total} pending={props.pending} method={props.method} />
      </div>
    </form>
  )
}

/** Submits the payment form from anywhere on the page via the `form` attribute. */
export function PayButton({ total, pending, method = 'momo' }: { total: number; pending: boolean; method?: PaymentMethod }) {
  return (
    <Button type="submit" form={PAYMENT_FORM_ID} size="xl" block disabled={pending} aria-busy={pending}>
      {pending ? (method === 'card' ? 'Opening the card page…' : 'Sending the prompt…') : `Pay ${cedis(total)}`}
    </Button>
  )
}
