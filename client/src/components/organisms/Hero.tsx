import { Badge, Heading } from '@/components/atoms'

export function Hero() {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-4 pb-[84px] pt-7 md:px-6 md:pb-24 md:pt-11 lg:pb-28 lg:pt-16">
        <div className="max-w-[720px]">
          <Badge tone="loading" dot className="mb-3 px-3 py-1.5 text-sm md:mb-3.5 lg:mb-4">
            Live from the stations
          </Badge>
          <Heading as="h1" size="hero">
            Know which bus is loading before you leave home.
          </Heading>
          <p className="m-0 mt-3 max-w-[560px] text-base text-on-dark md:mt-4 md:text-lg lg:mt-5 lg:text-[19px]">
            <span className="md:hidden">Pick your seat, pay with mobile money, board with a QR ticket.</span>
            <span className="hidden md:inline">See every bus on your route, pick your own seat, pay with mobile money and board with a QR ticket.</span>
          </p>
        </div>
      </div>
    </section>
  )
}
