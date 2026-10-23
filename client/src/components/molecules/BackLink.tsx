import { Link } from 'react-router'

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="text-[15px] font-semibold no-underline sm:text-base">
      ← {children}
    </Link>
  )
}
