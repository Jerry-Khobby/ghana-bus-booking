import { Icon } from '@/components/atoms'
import { cx, mmss } from '@/lib/format'

interface HoldTimerProps {
  secondsLeft: number
  /** `tint` sits on white cards, `dark` on the dark summary card, `strip` is the full-width phone bar. */
  tone?: 'tint' | 'dark' | 'strip'
  /** More than one seat is held. */
  plural?: boolean
}

export function HoldTimer({ secondsLeft, tone = 'tint', plural }: HoldTimerProps) {
  const noun = plural ? 'Seats' : 'Seat'
  return (
    <p
      role="timer"
      aria-live="off"
      className={cx(
        'm-0 flex items-center gap-2.5',
        tone === 'tint' && 'rounded-[10px] bg-brand-tint px-3.5 py-3 text-[15px] text-brand-ink',
        tone === 'dark' && 'text-[15px] font-semibold text-gold',
        tone === 'strip' && 'gap-2 bg-ink px-4 py-2.5 text-sm font-semibold text-gold',
      )}
    >
      <Icon name="clock" size={tone === 'strip' ? 16 : 18} />
      {tone === 'tint' ? (
        <span>
          {noun} held for you · <strong className="font-mono">{mmss(secondsLeft)}</strong>
        </span>
      ) : (
        <span>
          {noun} held for <span className="font-mono">{mmss(secondsLeft)}</span>
        </span>
      )}
    </p>
  )
}
