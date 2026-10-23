import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/app/AuthContext'
import { Avatar, ButtonLink, Icon, Logo } from '@/components/atoms'
import { NavItem, StepIndicator, type BookingStep } from '@/components/molecules'

const links = [
  { to: '/trips', label: 'Find a bus' },
  { to: '/tickets', label: 'My tickets' },
  { to: '/#how', label: 'How it works' },
]

interface SiteHeaderProps {
  /** In the booking flow the nav is replaced by the step pills. */
  step?: BookingStep
  /** Right-hand link instead of the nav, e.g. "← Back to search" on sign-in. */
  backLink?: { to: string; label: string }
}

export function SiteHeader({ step, backLink }: SiteHeaderProps) {
  const [open, setOpen] = useState(false)
  const { passenger, signOutPassenger } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const close = () => setOpen(false)
  // Signed-in passengers already know how it works; the design swaps that link for their name.
  // "How it works" is a section of the home page, so the header only offers it there.
  const navLinks = passenger || pathname !== '/' ? links.filter((l) => l.to !== '/#how') : links

  function signOut() {
    signOutPassenger()
    close()
    navigate('/')
  }

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-2.5 sm:px-6 sm:py-3.5">
        <Link to="/" className="text-ink no-underline hover:text-ink" aria-label="Seatline home">
          <Logo />
        </Link>

        {step ? (
          <StepIndicator current={step} />
        ) : backLink ? (
          <Link to={backLink.to} className="px-3.5 py-2.5 font-medium text-ink no-underline hover:text-brand">
            ← {backLink.label}
          </Link>
        ) : (
          <>
            <nav aria-label="Main" className="hidden flex-wrap items-center gap-2 md:flex">
              {navLinks.map((l) => (
                // The tablet design drops "How it works" to fit the header.
                <NavItem key={l.to} to={l.to} className={l.to === '/#how' ? 'md:max-lg:hidden' : undefined}>
                  {l.label}
                </NavItem>
              ))}
              {passenger ? (
                <span className="flex items-center gap-2.5 border-l border-line pl-2">
                  <Avatar initials={passenger.initials} />
                  <span className="hidden font-semibold lg:inline">{passenger.name}</span>
                  <button type="button" onClick={signOut} className="cursor-pointer border-0 bg-transparent px-2 py-2.5 font-medium text-brand hover:text-brand-dark">
                    Sign out
                  </button>
                </span>
              ) : (
                <ButtonLink to="/signin" variant="dark" size="md" className="min-h-11 rounded-[10px]">
                  Sign in
                </ButtonLink>
              )}
            </nav>
            {passenger ? (
              // Phones, signed in: avatar (to My tickets) and Sign out, as in the phone design.
              <div className="flex items-center gap-1.5 md:hidden">
                <Link to="/tickets" aria-label={`My tickets, signed in as ${passenger.name}`} className="no-underline">
                  <Avatar initials={passenger.initials} size="sm" />
                </Link>
                <button type="button" onClick={signOut} className="min-h-11 cursor-pointer border-0 bg-transparent px-1.5 text-[15px] font-semibold text-brand">
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls="mobile-nav"
                aria-label={open ? 'Close menu' : 'Open menu'}
                className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-surface text-ink md:hidden"
              >
                <Icon name={open ? 'close' : 'menu'} size={22} />
              </button>
            )}
          </>
        )}
      </div>

      {!step && !backLink && open && (
        <nav id="mobile-nav" aria-label="Main" className="flex flex-col gap-0.5 border-t border-sunken px-4 pb-4 pt-1 md:hidden">
          {passenger && (
            <p className="m-0 flex min-h-12 items-center gap-2.5 border-b border-sunken font-semibold">
              <Avatar initials={passenger.initials} size="sm" />
              {passenger.name}
            </p>
          )}
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={close}
              className="flex min-h-12 items-center border-b border-sunken text-lg font-semibold text-ink no-underline"
            >
              {l.label}
            </Link>
          ))}
          {passenger ? (
            <button type="button" onClick={signOut} className="mt-3 min-h-12 cursor-pointer rounded-[10px] border-2 border-ink bg-surface font-semibold text-ink">
              Sign out
            </button>
          ) : (
            <ButtonLink to="/signin" variant="dark" className="mt-3 rounded-[10px]" onClick={close}>
              Sign in
            </ButtonLink>
          )}
        </nav>
      )}
    </header>
  )
}
