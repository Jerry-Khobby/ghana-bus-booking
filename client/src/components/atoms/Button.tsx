import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cx } from '@/lib/format'

export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'outline-light' | 'light' | 'muted'
export type ButtonSize = 'md' | 'lg' | 'xl'

// Coloured variants fade when disabled; `muted` already is the designed disabled look.
const fade = 'disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary: `bg-brand text-white hover:bg-brand-dark hover:text-white disabled:bg-brand ${fade}`,
  dark: `bg-ink text-white hover:bg-ink-soft hover:text-white disabled:bg-ink ${fade}`,
  outline: `border-2 border-ink text-ink bg-surface hover:bg-canvas hover:text-ink ${fade}`,
  'outline-light': `border border-on-brand text-white hover:bg-white/10 hover:text-white ${fade}`,
  light: `bg-surface text-ink hover:bg-canvas hover:text-ink ${fade}`,
  muted: 'bg-sunken text-muted cursor-not-allowed',
}

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-12 px-[18px] rounded-xl',
  lg: 'min-h-[52px] px-5 rounded-xl',
  xl: 'min-h-14 px-5 rounded-xl text-lg',
}

const base =
  'inline-flex items-center justify-center gap-2.5 font-semibold no-underline transition-colors disabled:cursor-not-allowed'

interface StyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: ReactNode
}

export function buttonClasses({ variant = 'primary', size = 'md', block }: StyleProps) {
  return cx(base, variants[variant], sizes[size], block && 'w-full')
}

type ButtonProps = StyleProps & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ variant, size, block, icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClasses({ variant, size, block }), className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

type ButtonLinkProps = StyleProps & LinkProps

export function ButtonLink({ variant, size, block, icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cx(buttonClasses({ variant, size, block }), className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
