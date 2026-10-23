import type { ReactNode } from 'react'
import { SiteFooter, SiteHeader } from '@/components/organisms'
import { cx } from '@/lib/format'

interface PublicTemplateProps {
  /** Full-bleed band under the header (hero, route banner). */
  banner?: ReactNode
  /** The banner brings its own phone header, so hide the site header on phones. */
  bannerIsMobileHeader?: boolean
  children: ReactNode
}

/** Passenger pages outside the booking flow: header, optional banner, content, footer. */
export function PublicTemplate({ banner, bannerIsMobileHeader, children }: PublicTemplateProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className={cx(bannerIsMobileHeader && 'hidden md:block')}>
        <SiteHeader />
      </div>
      {banner}
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-16 sm:px-6">{children}</main>
      <SiteFooter />
    </div>
  )
}
