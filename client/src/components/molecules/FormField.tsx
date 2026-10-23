import type { ReactNode } from 'react'
import { FieldLabel } from '@/components/atoms'

interface FormFieldProps {
  id: string
  label: string
  hint?: string
  children: ReactNode
}

/**
 * Label stacked over a control, with an optional hint underneath.
 * The label gets the id `${id}-label` so custom controls (Dropdown) can use aria-labelledby.
 */
export function FormField({ id, label, hint, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} id={`${id}-label`}>
        {label}
      </FieldLabel>
      {children}
      {hint && <p className="m-0 text-sm text-muted">{hint}</p>}
    </div>
  )
}
