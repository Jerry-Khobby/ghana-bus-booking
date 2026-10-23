import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Eyebrow } from '@/components/atoms'
import { cx } from '@/lib/format'

interface CodeInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  legend?: string
}

/**
 * One box per digit for SMS codes. Typing moves to the next box, Backspace
 * goes back, and pasting a whole code fills every box.
 */
export function CodeInput({ length = 6, value, onChange, legend = `${length}-digit code` }: CodeInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  function focus(i: number) {
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus()
  }

  function setDigit(i: number, d: string) {
    const next = digits.slice()
    next[i] = d
    onChange(next.join('').slice(0, length))
  }

  function onInput(i: number, raw: string) {
    const d = raw.replace(/\D/g, '').slice(-1)
    setDigit(i, d)
    if (d) focus(i + 1)
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i]) {
      e.preventDefault()
      setDigit(i - 1, '')
      focus(i - 1)
    } else if (e.key === 'ArrowLeft') focus(i - 1)
    else if (e.key === 'ArrowRight') focus(i + 1)
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    e.preventDefault()
    onChange(pasted)
    focus(pasted.length)
  }

  return (
    <fieldset className="m-0 border-0 p-0">
      <Eyebrow as="legend" className="pb-2">
        {legend}
      </Eyebrow>
      <div className="grid max-w-[380px] grid-cols-6 gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            aria-label={`Digit ${i + 1}`}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={d}
            onChange={(e) => onInput(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            className={cx(
              'h-14 w-full min-w-0 rounded-[10px] bg-surface text-center font-mono text-2xl font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/25 md:h-[60px]',
              d ? 'border-2 border-brand' : 'border border-line-strong',
            )}
          />
        ))}
      </div>
    </fieldset>
  )
}
