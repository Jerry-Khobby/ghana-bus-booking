import { useSyncExternalStore } from 'react'

/*
 * Whether the Seatline API is awake. Render's free plan stops the server
 * after 15 idle minutes, and the first request then waits up to a minute
 * while it starts. The app pings /health as soon as it opens, so the server
 * starts waking before any page asks it for data, and screens can say why
 * they are waiting instead of looking stuck.
 */

export type ServerStatus = 'checking' | 'waking' | 'up' | 'down'

/** A warm server answers well inside this, so it never shows as waking. */
const WAKING_AFTER_MS = 2_500
/** Render gives up on a start after about this long. */
const GIVE_UP_MS = 150_000
const RETRY_MS = 3_000
/** One ping may sit this long while Render holds it during the start. */
const PING_TIMEOUT_MS = 70_000

let status: ServerStatus = 'checking'
let healthUrl = ''
let run = 0
const listeners = new Set<() => void>()

function set(next: ServerStatus) {
  if (status === next) return
  status = next
  listeners.forEach((listener) => listener())
}

/** Starts the first ping. main.tsx calls it once with the API's base URL. */
export function wakeServer(apiBase: string) {
  healthUrl = `${apiBase}/health`
  void ping()
}

/** "Try again" after the server could not be reached. */
export function retryServer() {
  set('checking')
  void ping()
}

/** Any real answer from the API proves it is awake. */
export function markServerUp() {
  set('up')
}

async function ping() {
  const mine = ++run
  const began = Date.now()
  const slow = window.setTimeout(() => {
    if (status === 'checking') set('waking')
  }, WAKING_AFTER_MS)
  try {
    while (mine === run && Date.now() - began < GIVE_UP_MS) {
      const abort = new AbortController()
      const timer = window.setTimeout(() => abort.abort(), PING_TIMEOUT_MS)
      try {
        const res = await fetch(healthUrl, { cache: 'no-store', signal: abort.signal })
        if (res.ok) return set('up')
      } catch {
        // Not up yet, or no connection: try again shortly
      } finally {
        window.clearTimeout(timer)
      }
      if (status === 'up') return
      await new Promise((resolve) => window.setTimeout(resolve, RETRY_MS))
    }
    if (mine === run && status !== 'up') set('down')
  } finally {
    window.clearTimeout(slow)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useServerStatus(): ServerStatus {
  return useSyncExternalStore(subscribe, () => status)
}
