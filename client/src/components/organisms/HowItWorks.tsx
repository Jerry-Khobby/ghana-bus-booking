import { Heading } from '@/components/atoms'

const steps = [
  { title: 'Find your bus', body: 'See scheduled trips and buses loading right now, with seats left.' },
  { title: 'Choose your seat', body: 'Your seat is held for 5 minutes while you pay. Nobody else can take it.' },
  { title: 'Pay with MoMo or card', body: 'Approve the prompt on your phone. Your ticket arrives by SMS too.' },
  { title: 'Board with your QR', body: 'The agent scans it at the bus door. Each ticket works once.' },
]

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-h" className="mt-16 scroll-mt-6">
      <Heading id="how-h">How it works</Heading>
      <ol className="m-0 mt-4 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-2 lg:mt-5 lg:grid-cols-4 lg:gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-b-xl border-t-4 border-ink bg-surface p-5">
            <div className="font-mono font-semibold text-brand">{String(i + 1).padStart(2, '0')}</div>
            <h3 className="m-0 mb-1.5 mt-2 text-lg font-semibold">{s.title}</h3>
            <p className="m-0 text-[15px] text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
