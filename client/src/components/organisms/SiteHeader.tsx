import { useState } from 'react'
import { Link } from 'react-router'
import { ButtonLink, Icon, Logo } from '@/components/atoms'
import { NavItem, StepIndicator, type BookingStep } from '@/components/molecules'

const links = [
  { to: '/trips', label: 'Find a bus' },
  { to: '/ticket', label: 'My tickets' },
  { to: '/#how', label: 'How it works' },
]

interface SiteHeaderProps {
  /** In the booking flow the nav is replaced by the step pills. */
  step?: BookingStep
}

export function SiteHeader({ step }: SiteHeaderProps) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-2.5 sm:px-6 sm:py-3.5">
        <Link to="/" className="text-ink no-underline hover:text-ink" aria-label="Seatline home">
          <Logo />
        </Link>

        {step ? (
          <StepIndicator current={step} />
        ) : (
          <>
            <nav aria-label="Main" className="hidden flex-wrap items-center gap-2 md:flex">
              {links.map((l) => (
                <NavItem key={l.to} to={l.to}>
                  {l.label}
                </NavItem>
              ))}
              <ButtonLink to="/signin" variant="dark" size="md" className="min-h-11 rounded-[10px]">
                Sign in
              </ButtonLink>
            </nav>
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
          </>
        )}
      </div>

      {!step && open && (
        <nav id="mobile-nav" aria-label="Main" className="flex flex-col gap-0.5 border-t border-sunken px-4 pb-4 pt-1 md:hidden">
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
          <ButtonLink to="/signin" variant="dark" className="mt-3 rounded-[10px]" onClick={close}>
            Sign in
          </ButtonLink>
        </nav>
      )}
    </header>
  )
}
