import type { ReactNode } from 'react'
import { BackLink, MobileTopBar, type BookingStep } from '@/components/molecules'
import { SiteHeader } from '@/components/organisms'

interface BookingTemplateProps {
  step: BookingStep
  back: { to: string; label: string }
  /** Title row: the h1 plus any badges next to it (tablet and desktop). Null for centred status pages. */
  title: ReactNode | null
  /** Compact header used on phones instead of the site header and title row. */
  mobile: { title: string; subtitle?: string; trailing?: ReactNode }
  /** Full-width strip under the phone header, e.g. the hold timer. */
  mobileStrip?: ReactNode
  /** Sticky bar pinned to the bottom of the screen on phones. */
  mobileBar?: ReactNode
  children: ReactNode
}

/** Seat and payment steps: header with step pills, back link, title, then content. */
export function BookingTemplate({ step, back, title, mobile, mobileStrip, mobileBar, children }: BookingTemplateProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="hidden md:block">
        <SiteHeader step={step} />
      </div>
      <div className="md:hidden">
        <MobileTopBar back={back} title={mobile.title} subtitle={mobile.subtitle} trailing={mobile.trailing} />
        {mobileStrip}
      </div>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-6 pt-3.5 sm:px-6 md:pb-16 md:pt-6 lg:pt-7">
        {title && (
          <div className="hidden md:block">
            <BackLink to={back.to}>{back.label}</BackLink>
            <div className="mt-3 flex flex-wrap items-center gap-3">{title}</div>
          </div>
        )}
        <div className={title ? 'md:mt-6' : undefined}>{children}</div>
      </main>

      {mobileBar && (
        <div className="sticky bottom-0 z-20 border-t border-line bg-surface px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(22,32,28,0.10)] md:hidden">
          {mobileBar}
        </div>
      )}
    </div>
  )
}
