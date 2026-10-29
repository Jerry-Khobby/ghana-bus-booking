import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/app/AuthContext'
import { useStation } from '@/app/StationContext'
import { AgentHeader } from '@/components/organisms'
import { cx } from '@/lib/format'

interface AgentTemplateProps {
  children: ReactNode
  /** Sub-pages (walk-in sale) show a back arrow on phones. */
  back?: { to: string; label: string; title: string }
  /** `split` puts the main card and sidebar side by side on desktop; `stack` is a single column. */
  layout?: 'split' | 'stack'
}

/** Agent pages are for operator staff. Anyone else goes to staff sign-in and comes back. */
export function RequireAgent({ children }: { children: ReactNode }) {
  const { staff, ready } = useAuth()
  const { pathname } = useLocation()
  if (!ready) {
    return (
      <p role="status" className="p-16 text-center text-muted">
        Checking your sign-in…
      </p>
    )
  }
  if (!staff || staff.role === 'platform') {
    return <Navigate to={`/staff/signin?role=agent&next=${encodeURIComponent(pathname)}`} replace />
  }
  return <>{children}</>
}

export function AgentTemplate(props: AgentTemplateProps) {
  return (
    <RequireAgent>
      <AgentLayout {...props} />
    </RequireAgent>
  )
}

function AgentLayout({ children, back, layout = 'split' }: AgentTemplateProps) {
  const { staff } = useAuth()
  const { console: consoleQuery } = useStation()
  if (!staff) return null

  const data = consoleQuery.data
  const station = data ? `${data.bay.station.city} — ${data.bay.station.name}` : (staff.station ? `${staff.station.city} — ${staff.station.name}` : '')
  return (
    <div className="min-h-screen">
      <AgentHeader station={station} agent={staff.name} back={back} />
      <main
        className={cx(
          'mx-auto flex max-w-[1200px] flex-col gap-4 px-4 pb-16 pt-4 sm:px-6 md:gap-[18px] md:pt-5 lg:pt-7',
          layout === 'split' && 'lg:flex-row lg:items-start lg:gap-6',
        )}
      >
        {children}
      </main>
    </div>
  )
}
