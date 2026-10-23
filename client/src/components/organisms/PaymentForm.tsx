import type { FormEvent } from 'react'
import { Button, Eyebrow, TextInput } from '@/components/atoms'
import { FormField, OptionTile, SegmentedControl } from '@/components/molecules'
import type { MomoNetwork, PaymentMethod } from '@/data/types'
import { cedis } from '@/lib/format'

const networks: MomoNetwork[] = ['MTN', 'Telecel', 'AT']

export const PAYMENT_FORM_ID = 'payment-form'

interface PaymentFormProps {
  total: number
  method: PaymentMethod
  onMethodChange: (m: PaymentMethod) => void
  network: MomoNetwork
  onNetworkChange: (n: MomoNetwork) => void
  phone: string
  onPhoneChange: (p: string) => void
  onSubmit: () => void
  pending: boolean
}

export function PaymentForm(props: PaymentFormProps) {
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
          <FormField id="phone" label="Mobile money number" hint="You will get a prompt on this phone. Enter your PIN there to approve.">
            <TextInput
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="024 000 0000"
              inputSize="lg"
              mono
              required
              pattern="[0-9 +]{10,16}"
              title="A Ghana mobile number, e.g. 024 000 0000"
              value={props.phone}
              onChange={(e) => props.onPhoneChange(e.target.value)}
            />
          </FormField>
        </>
      ) : (
        <>
          <FormField id="cardno" label="Card number">
            <TextInput id="cardno" inputMode="numeric" autoComplete="cc-number" placeholder="Card number" inputSize="lg" mono />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="exp" label="Expiry">
              <TextInput id="exp" autoComplete="cc-exp" placeholder="MM / YY" inputSize="lg" />
            </FormField>
            <FormField id="cvv" label="CVV">
              <TextInput id="cvv" autoComplete="cc-csc" inputMode="numeric" placeholder="123" inputSize="lg" />
            </FormField>
          </div>
          <p className="m-0 text-sm text-muted">Card details go straight to the payment provider. Seatline never stores them.</p>
        </>
      )}

      {/* On phones the pay button lives in the sticky bar instead. */}
      <div className="hidden md:block">
        <PayButton total={props.total} pending={props.pending} />
      </div>
    </form>
  )
}

/** Submits the payment form from anywhere on the page via the `form` attribute. */
export function PayButton({ total, pending }: { total: number; pending: boolean }) {
  return (
    <Button type="submit" form={PAYMENT_FORM_ID} size="xl" block disabled={pending} aria-busy={pending}>
      {pending ? 'Waiting for approval on your phone…' : `Pay ${cedis(total)}`}
    </Button>
  )
}
