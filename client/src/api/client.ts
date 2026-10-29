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

// ─── Session ─────────────────────────────────────────────────────────────────
// The access token lives in memory only; the refresh token is an httpOnly
// cookie the page never sees. A reload starts signed out until restoreSession.

let accessToken: string | null = null
const listeners = new Set<(token: string | null) => void>()

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token: string | null) {
  accessToken = token
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
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      const token = res.ok ? ((await res.json()) as { accessToken: string }).accessToken : null
      setAccessToken(token)
      return token
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

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`
    if (options.holdToken) headers['X-Hold-Token'] = options.holdToken
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
    return fetch(apiUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      signal: options.signal,
    })
  }

  let res: Response
  try {
    const token = accessToken
    res = await send(token)
    // The access token ran out (they last 15 minutes): refresh once and retry
    if (res.status === 401 && token) {
      const fresh = await refreshSession()
      if (fresh) res = await send(fresh)
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError(0, 'NETWORK', 'Could not reach Seatline. Check your connection and try again.')
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? safeJson(text) : undefined
  if (!res.ok) {
    const error = (data as { error?: { code: string; message: string; details?: Record<string, unknown>; requestId?: string } })
      ?.error
    throw new ApiError(
      res.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
      error?.requestId,
    )
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
