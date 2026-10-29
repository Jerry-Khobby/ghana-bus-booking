import { useEffect, useRef } from 'react'
import { apiUrl } from './client'

/*
 * Live updates come as Server-Sent Events: the seat map, a payment, and the
 * agent console. EventSource can't send headers, so tokens go in the URL
 * (the API keeps them out of its logs). The browser reconnects by itself
 * after a drop; `onOpen` runs each time, so the caller can re-read anything
 * missed while it was away.
 */

type Query = Parameters<typeof apiUrl>[1]

interface StreamOptions<T> {
  /** The `event:` name the server sends, e.g. "seat". */
  event: string
  onMessage: (data: T) => void
  onOpen?: () => void
  /** Null or false: don't connect (yet). */
  enabled?: boolean
}

export function useEventStream<T>(path: string | null, query: Query, options: StreamOptions<T>) {
  // Latest callbacks without reconnecting when they change
  const handlers = useRef(options)
  handlers.current = options
  const url = path && options.enabled !== false ? apiUrl(path, query) : null

  useEffect(() => {
    if (!url) return
    const source = new EventSource(url, { withCredentials: true })
    const onMessage = (e: MessageEvent<string>) => {
      try {
        handlers.current.onMessage(JSON.parse(e.data) as T)
      } catch {
        // A malformed event is skipped; the next full read corrects the screen
      }
    }
    source.addEventListener(options.event, onMessage as EventListener)
    source.onopen = () => handlers.current.onOpen?.()
    return () => source.close()
  }, [url, options.event])
}
