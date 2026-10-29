import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  restoreSession,
  signOut as endSession,
  staffLogin,
  verifyCode,
  type ApiPassenger,
  type ApiStaff,
  type StaffSignedIn,
} from '@/api/auth'
import { onAccessTokenChange } from '@/api/client'

/*
 * Who is signed in. Passengers sign in with an emailed code; staff (station
 * agents and operators) with a work email and password. One session at a
 * time: both kinds share the refresh cookie, so signing in as one signs the
 * other out. A reload restores the session from that cookie.
 */

export interface Passenger {
  id: string
  /** Their name if they've given one, else the start of their email. */
  name: string
  initials: string
  email: string
  /** E.164, pre-fills mobile money. */
  phone: string | null
}

export type StaffRole = 'agent' | 'operator' | 'platform'

export interface Staff extends Omit<ApiStaff, 'role'> {
  role: StaffRole
  /** Where they work from: /agent, /operator or /platform. */
  home: string
}

interface AuthContextValue {
  /** False until the saved session has been checked on load. */
  ready: boolean
  passenger: Passenger | null
  staff: Staff | null
  signInPassenger: (email: string, code: string) => Promise<Passenger>
  signInStaff: (email: string, password: string, as: 'agent' | 'operator') => Promise<Staff>
  /** After accepting an invite or resetting a password. */
  setStaffSession: (signedIn: StaffSignedIn) => Staff
  updatePassenger: (passenger: ApiPassenger) => void
  signOut: () => Promise<void>
  signOutPassenger: () => Promise<void>
  signOutStaff: () => Promise<void>
}

const ROLES: Record<ApiStaff['role'], StaffRole> = {
  AGENT: 'agent',
  OPERATOR_ADMIN: 'operator',
  PLATFORM_ADMIN: 'platform',
}
const HOMES: Record<StaffRole, string> = { agent: '/agent', operator: '/operator', platform: '/platform' }

export function toPassenger(p: ApiPassenger): Passenger {
  const name = p.name?.trim() || p.email.split('@')[0]
  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return { id: p.id, name, initials: initials || '?', email: p.email, phone: p.phone }
}

function toStaff(s: ApiStaff, home?: string): Staff {
  const role = ROLES[s.role]
  return { ...s, role, home: home ?? HOMES[role] }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)
  const [passenger, setPassenger] = useState<Passenger | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)

  useEffect(() => {
    let live = true
    void restoreSession().then((session) => {
      if (!live) return
      if (session?.kind === 'passenger') setPassenger(toPassenger(session.passenger))
      if (session?.kind === 'staff') setStaff(toStaff(session.staff))
      setReady(true)
    })
    return () => {
      live = false
    }
  }, [])

  // The refresh cookie was refused (signed out elsewhere, or it expired)
  useEffect(
    () =>
      onAccessTokenChange((token) => {
        if (token) return
        setPassenger(null)
        setStaff(null)
      }),
    [],
  )

  const signOut = useCallback(async () => {
    await endSession()
    setPassenger(null)
    setStaff(null)
    // Nothing signed-in should linger in the cache for the next person
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'stations' && q.queryKey[0] !== 'trips' })
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      passenger,
      staff,
      signInPassenger: async (email, code) => {
        const p = toPassenger(await verifyCode(email, code))
        setStaff(null)
        setPassenger(p)
        return p
      },
      signInStaff: async (email, password, as) => {
        const res = await staffLogin(email, password, as === 'agent' ? 'AGENT' : 'OPERATOR')
        const s = toStaff(res.staff, res.home)
        setPassenger(null)
        setStaff(s)
        return s
      },
      setStaffSession: (signedIn) => {
        const s = toStaff(signedIn.staff, signedIn.home)
        setPassenger(null)
        setStaff(s)
        return s
      },
      updatePassenger: (p) => setPassenger(toPassenger(p)),
      signOut,
      signOutPassenger: signOut,
      signOutStaff: signOut,
    }),
    [ready, passenger, staff, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** "you@example.com" → "yo***@example.com" */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return email
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`
}
