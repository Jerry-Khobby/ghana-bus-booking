import { Heading } from '@/components/atoms'

const steps = [
  {
    title: 'Find your bus',
    body: 'See scheduled trips and buses loading right now, with seats left.',
    short: 'Scheduled trips and buses loading now, with seats left.',
  },
  {
    title: 'Choose your seat',
    body: 'Your seat is held for 5 minutes while you pay. Nobody else can take it.',
    short: 'Held for 5 minutes while you pay.',
  },
  {
    title: 'Pay with MoMo or card',
    body: 'Approve the prompt on your phone. Your ticket arrives by SMS too.',
    short: 'Approve the prompt on your phone.',
  },
  {
    title: 'Board with your QR',
    body: 'The agent scans it at the bus door. Each ticket works once.',
    short: 'Scanned once at the bus door.',
  },
]

/** Phones: compact numbered rows. Tablet and desktop: cards with a dark top rule. */
export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-h" className="mt-9 scroll-mt-6 md:mt-12 lg:mt-16">
      <Heading id="how-h" className="text-2xl md:text-[28px] lg:text-[30px]">
        How it works
      </Heading>
      <ol className="m-0 mt-3 grid list-none grid-cols-1 gap-2.5 p-0 md:mt-4 md:grid-cols-2 md:gap-3.5 lg:mt-5 lg:grid-cols-4 lg:gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3.5 rounded-xl bg-surface p-3.5 md:block md:rounded-t-none md:border-t-4 md:border-ink md:p-[18px] lg:p-5">
            <div className="font-mono font-semibold text-brand">{String(i + 1).padStart(2, '0')}</div>
            <div>
              <h3 className="m-0 text-[17px] font-semibold md:mb-1 md:mt-1.5 md:text-lg lg:mb-1.5 lg:mt-2">{s.title}</h3>
              <p className="m-0 mt-0.5 text-[15px] text-muted md:mt-0">
                <span className="md:hidden">{s.short}</span>
                <span className="hidden md:inline lg:hidden">{i === 1 ? 'Your seat is held for 5 minutes while you pay.' : s.body}</span>
                <span className="hidden lg:inline">{s.body}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
