import type { ReactNode } from 'react'
import { FieldLabel } from '@/components/atoms'

interface FormFieldProps {
  id: string
  label: ReactNode
  hint?: ReactNode
  /** What's wrong with the value, e.g. from the server's field errors. Replaces the hint. */
  error?: ReactNode
  children: ReactNode
}

/**
 * Label stacked over a control, with an optional hint or error underneath.
 * The label gets the id `${id}-label` so custom controls (Dropdown) can use aria-labelledby.
 */
export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} id={`${id}-label`}>
        {label}
      </FieldLabel>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="m-0 text-sm text-muted">{hint}</p>
      )}
    </div>
  )
}
