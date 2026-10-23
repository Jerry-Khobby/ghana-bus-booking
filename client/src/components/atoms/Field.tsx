import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '@/lib/format'

const control =
  'w-full rounded-[10px] border border-line-strong bg-surface text-ink placeholder:text-muted/70 hover:border-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 [color-scheme:light]'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: 'md' | 'lg'
  mono?: boolean
  ref?: Ref<HTMLInputElement>
}

export function TextInput({ inputSize = 'md', mono, className, ...rest }: InputProps) {
  return (
    <input
      className={cx(control, 'px-3.5', inputSize === 'md' ? 'h-12' : 'h-[52px]', mono && 'font-mono text-lg', className)}
      {...rest}
    />
  )
}

export function Checkbox({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="checkbox" className={cx('size-[18px] shrink-0 accent-brand', className)} {...rest} />
}

export function FieldLabel({ htmlFor, children, id }: { htmlFor?: string; children: ReactNode; id?: string }) {
  return (
    <label id={id} htmlFor={htmlFor} className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">
      {children}
    </label>
  )
}
