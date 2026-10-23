import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '@/components/atoms'
import { MobileTopBar } from '@/components/molecules'
import { SiteHeader } from '@/components/organisms'

interface AuthTemplateProps {
  /** `passenger` is the light sign-in page; `staff` the dark one. */
  variant: 'passenger' | 'staff'
  children: ReactNode
}

/** Sign-in pages: a slim header that leads back out, and the forms centred below. */
export function AuthTemplate({ variant, children }: AuthTemplateProps) {
  if (variant === 'staff') {
    return (
      <div className="flex min-h-screen flex-col bg-ink">
        <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-3 md:px-6 md:py-[18px]">
          <Link to="/" className="text-white no-underline hover:text-white" aria-label="Seatline home">
            <Logo
              label={
                <>
                  Seatline <span className="font-medium text-on-dark">Staff</span>
                </>
              }
            />
          </Link>
          <Link to="/signin" className="flex min-h-11 items-center px-1 font-medium text-white hover:text-on-dark md:px-3.5">
            <span className="md:hidden">Passenger</span>
            <span className="hidden md:inline">Passenger sign in</span>
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-8 pt-5 md:items-center md:px-6 md:pb-16 md:pt-6">{children}</main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="hidden md:block">
        <SiteHeader backLink={{ to: '/', label: 'Back to search' }} />
      </div>
      <div className="md:hidden">
        <MobileTopBar back={{ to: '/', label: 'Back to search' }} title="Seatline" asHeading={false} />
      </div>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 pb-7 pt-5 md:gap-5 md:px-6 md:pb-12 md:pt-8 lg:flex-row lg:items-stretch lg:gap-8 lg:py-12">
        {children}
      </main>
    </div>
  )
}
