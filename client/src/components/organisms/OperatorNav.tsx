import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '@/app/AuthContext'
import { Icon, LogoMark, type IconName } from '@/components/atoms'
import { NavItem } from '@/components/molecules'
import { cx } from '@/lib/format'

const items: Array<{ to: string; label: string; short: string; icon: IconName; end?: boolean }> = [
  { to: '/operator', label: 'Overview', short: 'Overview', icon: 'overview', end: true },
  { to: '/operator/trips', label: 'Trips', short: 'Trips', icon: 'trips' },
  { to: '/operator/buses', label: 'Buses', short: 'Buses', icon: 'bus' },
  { to: '/operator/layouts', label: 'Seat layouts', short: 'Layouts', icon: 'layouts' },
  { to: '/operator/routes', label: 'Routes and fares', short: 'Routes', icon: 'routes' },
  { to: '/operator/agents', label: 'Agents', short: 'Agents', icon: 'agents' },
  { to: '/operator/reports', label: 'Reports', short: 'Reports', icon: 'reports' },
]

interface OperatorNavProps {
  operator: string
  title: string
  /** What the page is about, after the operator name in the phone bar: "today", "fleet", "trips". */
  context?: string
  /** Phone header shows a back arrow to this page instead of the menu button. */
  back?: { to: string; label: string }
}

/** Sidebar on desktop, icon rail on tablet, collapsible top bar on phones. */
export function OperatorNav({ operator, title, context = 'today', back }: OperatorNavProps) {
  const [open, setOpen] = useState(false)
  const { signOutStaff } = useAuth()
  const navigate = useNavigate()

  function signOut() {
    signOutStaff()
    navigate('/staff/signin?role=operator')
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav aria-label="Operator menu" className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col gap-1 bg-ink px-3.5 py-5 text-white lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-[18px]">
          <LogoMark size={30} />
          <div>
            <p className="m-0 font-display font-extrabold">Seatline</p>
            <p className="m-0 text-[13px] text-on-dark">{operator}</p>
          </div>
        </div>
        {items.map((i) => (
          <NavItem key={i.to} to={i.to} end={i.end} tone="dark">
            {i.label}
          </NavItem>
        ))}
        <button
          type="button"
          onClick={signOut}
          className="mt-auto flex min-h-11 cursor-pointer items-center rounded-none border-0 border-t border-ink-soft bg-transparent px-3 text-left text-on-dark hover:text-white"
        >
          Sign out
        </button>
      </nav>

      {/* Tablet icon rail */}
      <nav aria-label="Operator menu" className="sticky top-0 hidden h-screen w-[84px] shrink-0 flex-col items-center gap-1.5 bg-ink px-2 py-4 md:flex lg:hidden">
        <div className="mb-3.5">
          <LogoMark size={34} />
        </div>
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            title={i.label}
            className={({ isActive }) =>
              cx(
                'flex w-[68px] flex-col items-center gap-0.5 rounded-[10px] py-2 text-[11px] no-underline',
                isActive ? 'bg-ink-soft font-semibold text-white' : 'text-on-dark hover:text-white',
              )
            }
          >
            <Icon name={i.icon} size={22} strokeWidth={2} />
            {i.short}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={signOut}
          className="mt-auto flex w-[68px] cursor-pointer flex-col items-center gap-0.5 rounded-[10px] border-0 bg-transparent py-2 text-[11px] text-on-dark hover:text-white"
        >
          <Icon name="signOut" size={22} strokeWidth={2} />
          Sign out
        </button>
      </nav>

      {/* Phone top bar */}
      <header className="bg-ink text-white md:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          {back ? (
            <NavLink to={back.to} aria-label={back.label} className="flex size-11 items-center justify-center rounded-[10px] text-white no-underline hover:text-on-dark">
              <Icon name="back" size={22} />
            </NavLink>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="operator-mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-ink-soft text-white"
            >
              <Icon name={open ? 'close' : 'menu'} size={22} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="m-0 font-display text-[17px] font-extrabold leading-tight">{title}</p>
            {!back && <p className="m-0 text-xs text-on-dark">{operator} · {context}</p>}
          </div>
        </div>
        {open && !back && (
          <nav id="operator-mobile-nav" aria-label="Operator menu" className="flex flex-col px-4 pb-3.5 pt-1">
            {items.map((i) => (
              <div key={i.to} className="border-b border-ink-soft">
                <NavItem to={i.to} end={i.end} tone="dark" onClick={() => setOpen(false)}>
                  {i.label}
                </NavItem>
              </div>
            ))}
            <button type="button" onClick={signOut} className="flex min-h-12 cursor-pointer items-center border-0 bg-transparent px-3 text-left font-semibold text-gold">
              Sign out
            </button>
          </nav>
        )}
      </header>
    </>
  )
}
