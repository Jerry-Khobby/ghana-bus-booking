import { api, refreshSession, setAccessToken } from './client'

/* Signing in and out: passengers by emailed code, staff by password. */

export interface ApiPassenger {
  id: string
  email: string
  phone: string | null
  name: string | null
}

export type ApiStaffRole = 'AGENT' | 'OPERATOR_ADMIN' | 'PLATFORM_ADMIN'

export interface ApiStaff {
  id: string
  name: string
  email: string
  role: ApiStaffRole
  operator: { id: string; name: string } | null
  station: { id: string; name: string; city: string } | null
  bays: { id: string; number: number }[]
}

/** Who an access token belongs to, read from its claims (not verified here). */
export function tokenKind(token: string): 'passenger' | 'staff' | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { typ?: string }
    return payload.typ === 'passenger' || payload.typ === 'staff' ? payload.typ : null
  } catch {
    return null
  }
}

// ─── Passengers ──────────────────────────────────────────────────────────────

export function requestCode(email: string) {
  return api<{ expiresInSeconds: number; resendAfterSeconds: number }>('/auth/otp/request', {
    method: 'POST',
    body: { email },
  })
}

export async function verifyCode(email: string, code: string) {
  const res = await api<{ accessToken: string; passenger: ApiPassenger }>('/auth/otp/verify', {
    method: 'POST',
    body: { email, code },
  })
  setAccessToken(res.accessToken)
  return res.passenger
}

export const getMe = () => api<ApiPassenger>('/me')

export function updateMe(body: { name?: string; phone?: string }) {
  return api<ApiPassenger>('/me', { method: 'PATCH', body })
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export interface StaffSignedIn {
  staff: ApiStaff
  /** Where the app sends them: /agent, /operator or /platform. */
  home: string
}

export async function staffLogin(email: string, password: string, as: 'AGENT' | 'OPERATOR') {
  const res = await api<StaffSignedIn & { accessToken: string }>('/staff/auth/login', {
    method: 'POST',
    body: { email, password, as },
  })
  setAccessToken(res.accessToken)
  return res
}

/** From the invite or reset email: sets the password and signs in. */
export async function setStaffPassword(kind: 'accept-invite' | 'reset-password', token: string, password: string) {
  const res = await api<StaffSignedIn & { accessToken: string }>(`/staff/auth/${kind}`, {
    method: 'POST',
    body: { token, password },
  })
  setAccessToken(res.accessToken)
  return res
}

export const getStaffMe = () => api<ApiStaff>('/staff/me')

// ─── Both ────────────────────────────────────────────────────────────────────

/** On page load: swap the refresh cookie for a session, if there is one. */
export async function restoreSession(): Promise<
  { kind: 'passenger'; passenger: ApiPassenger } | { kind: 'staff'; staff: ApiStaff } | null
> {
  const token = await refreshSession()
  if (!token) return null
  try {
    if (tokenKind(token) === 'staff') return { kind: 'staff', staff: await getStaffMe() }
    return { kind: 'passenger', passenger: await getMe() }
  } catch {
    setAccessToken(null)
    return null
  }
}

export async function signOut() {
  await api<void>('/auth/logout', { method: 'POST' }).catch(() => undefined)
  setAccessToken(null)
}
