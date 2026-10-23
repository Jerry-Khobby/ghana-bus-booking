import { Badge, Heading } from '@/components/atoms'

export function Hero() {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 sm:px-6 sm:pb-28 sm:pt-16">
        <div className="max-w-[720px]">
          <Badge tone="loading" dot className="mb-4 px-3 py-1.5 text-sm">
            Live from the stations
          </Badge>
          <Heading as="h1" size="hero">
            Know which bus is loading before you leave home.
          </Heading>
          <p className="m-0 mt-5 max-w-[560px] text-[17px] text-on-dark sm:text-[19px]">
            See every bus on your route, pick your own seat, pay with mobile money and board with a QR ticket.
          </p>
        </div>
      </div>
    </section>
  )
}
