import { Link } from 'react-router'
import { ButtonLink, Heading } from '@/components/atoms'
import { MobileTopBar } from '@/components/molecules'

interface RouteBannerProps {
  from: { city: string; station?: string }
  to: { city: string; station?: string }
  caption: string
}

function place(p: RouteBannerProps['from']) {
  return p.station ? `${p.city} (${p.station})` : p.city
}

/** Dark band at the top of the results page. On phones it is the whole header. */
export function RouteBanner({ from, to, caption }: RouteBannerProps) {
  const stations = from.station && to.station ? `${from.station} → ${to.station} · ` : ''
  return (
    <>
      <div className="md:hidden">
        <MobileTopBar
          tone="dark"
          centered
          back={{ to: '/', label: 'Back to search' }}
          title={`${from.city} → ${to.city}`}
          subtitle={`${stations}${caption.toLowerCase()}`}
          trailing={
            <Link to="/" className="flex min-h-11 items-center px-2.5 text-[15px] font-semibold text-white hover:text-on-dark">
              Edit
            </Link>
          }
        />
      </div>

      <section className="hidden bg-ink text-white md:block">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-[22px] lg:py-7">
          <div>
            <p className="m-0 text-sm text-on-dark">{caption}</p>
            <Heading as="h1" size="xl" className="mt-1">
              {place(from)} → {place(to)}
            </Heading>
          </div>
          <ButtonLink to="/" variant="outline-light" className="border-muted">
            Change search
          </ButtonLink>
        </div>
      </section>
    </>
  )
}
