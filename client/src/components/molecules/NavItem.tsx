import { NavLink } from 'react-router'
import { cx } from '@/lib/format'

interface NavItemProps {
  to: string
  children: string
  /** `dark` is the operator sidebar; `light` is the public header. */
  tone?: 'dark' | 'light'
  end?: boolean
  onClick?: () => void
  className?: string
}

export function NavItem({ to, children, tone = 'light', end, onClick, className }: NavItemProps) {
  // In-page anchors ("/#how") are never the current page; NavLink ignores the hash and would mark them active.
  const anchor = to.includes('#')
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive: routeActive }) => {
        const isActive = routeActive && !anchor
        return cx(
          'flex min-h-11 items-center no-underline',
          tone === 'light' && 'px-3.5 py-2.5 font-medium',
          tone === 'light' && (isActive ? 'font-semibold text-brand' : 'text-ink hover:text-brand'),
          tone === 'dark' && 'rounded-[10px] px-3',
          tone === 'dark' && (isActive ? 'bg-ink-soft font-semibold text-white' : 'text-on-dark hover:text-white'),
          className,
        )
      }}
    >
      {children}
    </NavLink>
  )
}
