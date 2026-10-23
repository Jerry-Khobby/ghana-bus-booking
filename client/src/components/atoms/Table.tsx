import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cx } from '@/lib/format'

/** Column header: small uppercase label. */
export function Th({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cx('border-b border-line p-3 text-[13px] font-semibold uppercase tracking-[0.05em] text-muted', className)} {...rest}>
      {children}
    </th>
  )
}

export function Td({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx('border-b border-sunken p-3 align-middle', className)} {...rest}>
      {children}
    </td>
  )
}

/** Text only screen readers hear, e.g. a label for an actions column. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
