/*
 * The one way the app talks to the Seatline API. Every call goes through
 * `api()`: it adds the access token, refreshes it once when it has expired,
 * and turns failures into an ApiError with the server's code and message.
 *
 * In development Vite forwards /api to the API (see vite.config.ts), so the
 * browser sees one site and the refresh cookie just works. A production build
 * calls VITE_API_URL, or the same site when the web host forwards /api.
 */

const ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const API_BASE = `${ORIGIN}/api/v1`

/** What every failed call throws. `code` is the server's, e.g. SEAT_TAKEN. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Field messages from VALIDATION_FAILED, e.g. { phone: ['…'] }. */
  get fields(): Record<string, string[]> {
    return (this.details.fields as Record<string, string[]> | undefined) ?? {}
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

/** A message fit to show a passenger, whatever went wrong. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Something went wrong. Please try again.'
}

const NETWORK_MESSAGE = 'Could not reach Seatline. Check your connection and try again.'

/** The request never got a real answer: no connection, a timeout, or a proxy with nothing to say. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NETWORK'
}

// ─── Session ─────────────────────────────────────────────────────────────────
// The access token lives in memory only; the refresh token is an httpOnly
// cookie the page never sees. A reload starts signed out until restoreSession.

let accessToken: string | null = null
const listeners = new Set<(token: string | null) => void>()

export function getAccessToken() {
  return accessToken
}

/*
 * Whether this browser has signed in, so a page load only asks the API to
 * restore a session when there may be one (a signed-out visitor would get a
 * 401 every time). Cleared on sign-out or when the API refuses the cookie.
 */
const SESSION_HINT = 'seatline.session'

function hasSessionHint() {
  try {
    return window.localStorage.getItem(SESSION_HINT) === '1'
  } catch {
    return true // Can't tell: ask anyway
  }
}

function setSessionHint(on: boolean) {
  try {
    if (on) window.localStorage.setItem(SESSION_HINT, '1')
    else window.localStorage.removeItem(SESSION_HINT)
  } catch {
    // Not remembered: the next load just asks
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token
  setSessionHint(!!token)
  listeners.forEach((listener) => listener(token))
}

/** Called with the new token (or null) whenever the session changes. */
export function onAccessTokenChange(listener: (token: string | null) => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

let refreshing: Promise<string | null> | null = null

/**
 * Swaps the refresh cookie for a new access token. Calls made at the same
 * moment share one refresh, since each refresh token works only once.
 */
export function refreshSession(): Promise<string | null> {
  if (!refreshing && !hasSessionHint()) return Promise.resolve(null)
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (res.ok) {
        const { accessToken: token } = (await res.json()) as { accessToken: string }
        setAccessToken(token)
        return token
      }
      // Only a refusal ends the session; a bad connection or a waking server
      // leaves the user signed in to try again
      if (res.status === 401 || res.status === 403) setAccessToken(null)
      return null
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

// ─── Requests ────────────────────────────────────────────────────────────────

type Query = Record<string, string | number | boolean | undefined | null | Array<string | number>>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Query
  /** X-Hold-Token: proves a guest owns a hold, its payment and tickets. */
  holdToken?: string | null
  idempotencyKey?: string
  signal?: AbortSignal
}

/** "/trips/search" + { from, busType: [..] } → full URL. Arrays repeat the key. */
export function apiUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v))
  }
  const qs = params.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

/** Longest a request may take before it counts as a lost connection. */
const TIMEOUT_MS = 30_000
/** Pauses before each retry of a request that never got an answer. */
const RETRY_DELAYS_MS = [1_000, 3_000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One request. Reads, and writes with an idempotency key (the server
 * replays those), are retried when the connection fails, since running them
 * twice can't do harm. Other writes fail at once and the caller decides.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const retryable = method === 'GET' || !!options.idempotencyKey
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<T>(path, options)
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt]
      if (!retryable || !isNetworkError(error) || delay === undefined || options.signal?.aborted) throw error
      await sleep(delay)
    }
  }
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const send = async (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`
    if (options.holdToken) headers['X-Hold-Token'] = options.holdToken
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

    // Give up on a request that hangs, but still let the caller cancel it
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const cancel = () => controller.abort()
    options.signal?.addEventListener('abort', cancel)
    try {
      return await fetch(apiUrl(path, options.query), {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'include',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', cancel)
    }
  }

  let res: Response
  try {
    // The session is being restored (page load): wait for its token rather
    // than going out without one and coming back with a 401
    if (!accessToken && refreshing) await refreshing
    const token = accessToken
    res = await send(token)
    // The access token ran out (they last 15 minutes), or the call went out
    // while the session was still being restored on page load: refresh once
    // (or wait for the refresh under way) and retry
    if (res.status === 401 && (token || refreshing || hasSessionHint())) {
      const fresh = await refreshSession()
      if (fresh && fresh !== token) res = await send(fresh)
    }
  } catch (error) {
    // Cancelled by the caller (the screen moved on): not an error to show
    if (options.signal?.aborted) throw error
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE)
  }

  if (res.status === 204) return undefined as T
  let text: string
  try {
    text = await res.text()
  } catch {
    // The connection dropped halfway through the reply
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE)
  }
  const data = text ? safeJson(text) : undefined
  if (!res.ok) {
    const error = (data as { error?: { code: string; message: string; details?: Record<string, unknown>; requestId?: string } })
      ?.error
    if (!error) {
      // Not the API's answer: a proxy, or Render waking the server up
      if (res.status >= 500) throw new ApiError(res.status, 'NETWORK', NETWORK_MESSAGE)
      throw new ApiError(res.status, 'INTERNAL', 'Something went wrong. Please try again.')
    }
    throw new ApiError(res.status, error.code, error.message, error.details, error.requestId)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** A random key so a retried payment request never charges twice. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}
