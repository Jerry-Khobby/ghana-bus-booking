import { Link } from 'react-router'

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-3 p-6 text-sm text-muted">
        <span>Seatline — bus seats for Ghana's stations</span>
        <span>
          <Link to="/staff/signin?role=agent">Station agents</Link> · <Link to="/staff/signin?role=operator">Operators</Link>
        </span>
      </div>
    </footer>
  )
}
