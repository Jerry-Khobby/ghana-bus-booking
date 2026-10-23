import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cx } from '@/lib/format'

export interface DropdownOption<T extends string> {
  value: T
  label: string
  /** Optional second line under the label. */
  hint?: string
}

interface DropdownProps<T extends string> {
  id?: string
  /** Visible label element's id; the button is announced with it. */
  labelledBy?: string
  /** Accessible name when there is no visible label. */
  ariaLabel?: string
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  /** `light` sits on white forms, `dark` on the agent header. */
  tone?: 'light' | 'dark'
  size?: 'md' | 'sm'
  className?: string
}

/**
 * Styled replacement for <select>, following the WAI-ARIA listbox pattern:
 * arrow keys, Home/End, Enter/Space, Escape and type-ahead all work.
 */
export function Dropdown<T extends string>({
  id,
  labelledBy,
  ariaLabel,
  value,
  options,
  onChange,
  tone = 'light',
  size = 'md',
  className,
}: DropdownProps<T>) {
  const autoId = useId()
  const buttonId = id ?? `${autoId}-button`
  const listId = `${autoId}-list`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)))
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })

  const selected = options.find((o) => o.value === value) ?? options[0]

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Move focus into the list when it opens and keep the active option visible.
  useEffect(() => {
    if (!open) return
    listRef.current?.focus()
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function openList() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  function close(focusButton = true) {
    setOpen(false)
    if (focusButton) buttonRef.current?.focus()
  }

  function choose(index: number) {
    onChange(options[index].value)
    close()
  }

  function typeAhead(key: string) {
    const now = Date.now()
    typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + key.toLowerCase(), at: now }
    const match = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
    if (match >= 0) setActive(match)
  }

  function onButtonKey(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      openList()
    }
  }

  function onListKey(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(options.length - 1, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'Tab':
        // Return focus to the button first so the browser's Tab moves on from there.
        close()
        break
      default:
        if (e.key.length === 1) typeAhead(e.key)
    }
  }

  const dark = tone === 'dark'

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy ? `${labelledBy} ${buttonId}` : undefined}
        aria-label={labelledBy ? undefined : ariaLabel}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
        className={cx(
          'flex w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] border text-left transition-colors',
          size === 'md' ? 'h-12 pl-3.5 pr-3' : 'h-11 pl-3 pr-2.5 text-[15px]',
          dark
            ? 'border-ink-line bg-ink-soft text-white hover:border-on-dark'
            : 'border-line-strong bg-surface text-ink hover:border-ink',
          open && (dark ? 'border-gold' : 'border-brand ring-2 ring-brand/25'),
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cx('shrink-0 transition-transform duration-150', dark ? 'text-on-dark' : 'text-muted', open && 'rotate-180')}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className={cx(
            'absolute z-30 mt-1.5 max-h-72 min-w-full overflow-auto rounded-xl border p-1.5 outline-none',
            'shadow-[0_12px_32px_rgba(22,32,28,0.16)]',
            dark ? 'right-0 border-ink-line bg-ink-soft text-white' : 'left-0 border-line bg-surface text-ink',
          )}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value
            const isActive = i === active
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={cx(
                  'flex min-h-11 cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2',
                  isActive && (dark ? 'bg-ink-line' : 'bg-brand-tint'),
                  isSelected && 'font-semibold',
                  isSelected && !dark && 'text-brand-ink',
                )}
              >
                <span className="flex flex-col">
                  <span>{o.label}</span>
                  {o.hint && <span className={cx('text-[13px] font-normal', dark ? 'text-on-dark' : 'text-muted')}>{o.hint}</span>}
                </span>
                {isSelected && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={dark ? 'text-gold' : 'text-brand'}>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
