import type { FormEvent, ReactNode } from 'react'
import { Button } from '@/components/atoms'

interface InlineFormCardProps {
  title: string
  /** Accessible name of the form, e.g. "Add bus". */
  label: string
  submitLabel: string
  onCancel: () => void
  onSubmit: () => void
  children: ReactNode
  /** Line under the fields, e.g. where to go for a missing option. */
  note?: ReactNode
}

/** Green-edged panel that opens above a list to add one item to it. */
export function InlineFormCard({ title, label, submitLabel, onCancel, onSubmit, children, note }: InlineFormCardProps) {
  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit()
  }

  return (
    <form aria-label={label} onSubmit={submit} className="flex flex-col gap-3.5 rounded-[14px] border-2 border-brand bg-surface p-4 md:p-5">
      <h2 className="m-0 font-display text-lg font-bold md:text-xl">{title}</h2>
      {children}
      {note && <p className="m-0 text-sm text-muted">{note}</p>}
      <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
