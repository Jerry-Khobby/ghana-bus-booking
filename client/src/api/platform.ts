import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

/* The platform admin's side: the bus companies on Seatline and the stations they share. */

export interface ApiPlatformOperator {
  id: string
  name: string
  slug: string
  phone: string | null
  email: string | null
  serviceFeePesewas: number
  holdMinutes: number
  status: 'ACTIVE' | 'SUSPENDED'
  createdAt: string
  counts: { buses: number; routes: number; staff: number }
}

export interface ApiOperatorAdmin {
  id: string
  name: string
  email: string
  status: 'INVITED' | 'ACTIVE' | 'DISABLED'
  lastActiveAt: string | null
}

export interface ApiPlatformStation {
  id: string
  name: string
  city: string
  region: string
  active: boolean
}

export const platformKeys = {
  all: ['platform'] as const,
  operators: ['platform', 'operators'] as const,
  admins: (operatorId: string) => ['platform', 'admins', operatorId] as const,
  stations: ['platform', 'stations'] as const,
}

export function usePlatformOperators() {
  return useQuery({
    queryKey: platformKeys.operators,
    queryFn: ({ signal }) => api<ApiPlatformOperator[]>('/platform/operators', { signal }),
  })
}

export function useOperatorAdmins(operatorId: string) {
  return useQuery({
    queryKey: platformKeys.admins(operatorId),
    queryFn: ({ signal }) => api<ApiOperatorAdmin[]>(`/platform/operators/${operatorId}/admins`, { signal }),
  })
}

export function usePlatformStations() {
  return useQuery({
    queryKey: platformKeys.stations,
    queryFn: ({ signal }) => api<ApiPlatformStation[]>('/platform/stations', { signal }),
  })
}

export type OperatorBody = {
  name: string
  slug: string
  phone?: string
  email?: string
  serviceFeePesewas?: number
  holdMinutes?: number
}

export const createOperator = (body: OperatorBody) => api<ApiPlatformOperator>('/platform/operators', { method: 'POST', body })
export const updateOperator = (id: string, body: Partial<Omit<OperatorBody, 'slug'>> & { status?: ApiPlatformOperator['status'] }) =>
  api<ApiPlatformOperator>(`/platform/operators/${id}`, { method: 'PATCH', body })
/** What suspending or deleting a company would touch. */
export interface ApiOperatorImpact {
  upcomingTrips: number
  ticketsOnUpcomingTrips: number
  /** Every booking it ever had; only a company with none can be deleted. */
  bookings: number
  staff: number
  deletable: boolean
}

export function useOperatorImpact(operatorId: string) {
  return useQuery({
    queryKey: [...platformKeys.all, 'impact', operatorId],
    queryFn: ({ signal }) => api<ApiOperatorImpact>(`/platform/operators/${operatorId}/impact`, { signal }),
  })
}

export interface ApiSuspendResult {
  operator: ApiPlatformOperator
  tripsCancelled: number
  refundsPending: number
  passengersEmailed: number
  cashToRepay: { code: string; seatLabel: string; passengerName: string | null; amountPesewas: number; soldBy: string | null }[]
}

/** Suspends the company (search, sales and staff sign-in stop), optionally cancelling its upcoming trips. */
export const suspendOperator = (id: string, body: { cancelTrips: boolean; reason?: string }) =>
  api<ApiSuspendResult>(`/platform/operators/${id}/suspend`, { method: 'POST', body })
/** Only for a company that never had a booking. */
export const deleteOperator = (id: string) => api<{ deleted: true }>(`/platform/operators/${id}`, { method: 'DELETE' })

export const inviteOperatorAdmin = (operatorId: string, body: { name: string; email: string }) =>
  api<ApiOperatorAdmin>(`/platform/operators/${operatorId}/admins`, { method: 'POST', body })
/** A new invite if they haven't joined, otherwise a password reset link. */
export const sendAdminLink = (adminId: string) =>
  api<{ sent: 'INVITE' | 'PASSWORD_RESET' }>(`/platform/admins/${adminId}/send-link`, { method: 'POST' })

export const createStation = (body: { name: string; city: string; region: string }) =>
  api<ApiPlatformStation>('/platform/stations', { method: 'POST', body })
export const updateStation = (id: string, body: Partial<Omit<ApiPlatformStation, 'id'>>) =>
  api<ApiPlatformStation>(`/platform/stations/${id}`, { method: 'PATCH', body })

// ─── Join Seatline applications ──────────────────────────────────────────────

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'DECLINED'

export interface ApiApplication {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  city: string
  fleetSize: number | null
  message: string | null
  status: ApplicationStatus
  declineReason: string | null
  reviewedAt: string | null
  createdAt: string
  operator: { id: string; name: string; slug: string } | null
}

export function useApplications(status: ApplicationStatus) {
  return useQuery({
    queryKey: [...platformKeys.all, 'applications', status],
    queryFn: ({ signal }) => api<ApiApplication[]>(`/platform/applications?status=${status}`, { signal }),
  })
}

/** Creates the company and invites the contact as its admin. */
export const approveApplication = (id: string, slug: string) =>
  api<{ operator: ApiPlatformOperator; admin: ApiOperatorAdmin }>(`/platform/applications/${id}/approve`, { method: 'POST', body: { slug } })
export const declineApplication = (id: string, reason?: string) =>
  api<{ declined: true }>(`/platform/applications/${id}/decline`, { method: 'POST', body: reason ? { reason } : {} })

/** The public "Join Seatline" form. The answer is the same whatever happens, so it can't be used to probe. */
export const applyToJoin = (body: {
  companyName: string
  contactName: string
  email: string
  phone: string
  city: string
  fleetSize?: number
  message?: string
  website?: string
}) => api<{ received: true }>('/applications', { method: 'POST', body })

export function useRefreshPlatform() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: platformKeys.all })
}

/** "Kofi & Sons Transport" → "kofi-sons-transport", for a new company's slug. */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
