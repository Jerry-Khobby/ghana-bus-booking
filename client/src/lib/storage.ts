/*
 * Browser storage that never breaks the page: private windows, blocked
 * cookies and full quotas all just mean "nothing remembered".
 */

type Area = 'local' | 'session'

const area = (which: Area): Storage | null => {
  try {
    return which === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readStored<T>(key: string, which: Area): T | null {
  try {
    const raw = area(which)?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeStored(key: string, value: unknown, which: Area) {
  try {
    const store = area(which)
    if (value === null || value === undefined) store?.removeItem(key)
    else store?.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do: the app works without it
  }
}
