import { useEffect, useState } from 'react'

/** Seconds left until `deadline` (epoch ms). Returns null when there is no deadline. */
export function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  if (deadline === null) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
