import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/*
 * Who is signed in. Passengers sign in with a phone number and SMS code;
 * staff (station agents and operators) with a work email and password.
 * Everything here is client-side until the API issues real sessions.
 */

export interface Passenger {
  name: string
  initials: string
  /** National number without the +233 prefix, e.g. "24 000 0000". */
  phone: string
}

export type StaffRole = 'agent' | 'operator'

export interface Staff {
  name: string
  email: string
  role: StaffRole
}

interface AuthContextValue {
  passenger: Passenger | null
  staff: Staff | null
  signInPassenger: (phone: string) => Passenger
  signInStaff: (email: string, role: StaffRole) => Staff
  signOutPassenger: () => void
  signOutStaff: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [passenger, setPassenger] = useState<Passenger | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)

  const value = useMemo<AuthContextValue>(
    () => ({
      passenger,
      staff,
      signInPassenger: (phone) => {
        // The demo account; the API will look the name up from the phone number.
        const p = { name: 'Ama K.', initials: 'AK', phone }
        setPassenger(p)
        return p
      },
      signInStaff: (email, role) => {
        const s = { name: role === 'agent' ? 'Kofi A.' : 'Coastline admin', email, role }
        setStaff(s)
        return s
      },
      signOutPassenger: () => setPassenger(null),
      signOutStaff: () => setStaff(null),
    }),
    [passenger, staff],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** "24 000 0000" → "+233 24 *** 0000" */
export function maskedIntl(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '')
  if (digits.length < 7) return `+233 ${phone}`
  return `+233 ${digits.slice(0, 2)} *** ${digits.slice(-4)}`
}
