import type { Trip, TripStatus } from './types'

/*
 * Mock data that stands in for the API until the server is built.
 * Fares and fees are placeholders, not real prices.
 */

const accraCircle = { city: 'Accra', name: 'Circle' }
const kumasiAsafo = { city: 'Kumasi', name: 'Asafo' }

export const SERVICE_FEE = 5

export const trips: Trip[] = [
  {
    id: 'gr-4471-24',
    from: accraCircle,
    to: kumasiAsafo,
    plate: 'GR 4471-24',
    operator: 'Coastline Express',
    busType: 'Air-conditioned coach',
    status: 'loading',
    bay: 6,
    eta: 'about 20 min',
    capacity: 49,
    seatsLeft: 8,
    fare: 150,
  },
  {
    id: 'as-3302-22',
    from: accraCircle,
    to: kumasiAsafo,
    plate: 'AS 3302-22',
    operator: 'Ashanti Link',
    busType: 'Standard bus',
    status: 'loading',
    bay: 9,
    eta: 'about 1 h',
    capacity: 49,
    seatsLeft: 31,
    fare: 120,
  },
  {
    id: 'gr-1190-25',
    from: accraCircle,
    to: kumasiAsafo,
    plate: 'GR 1190-25',
    operator: 'Coastline Express',
    busType: 'Air-conditioned coach',
    status: 'scheduled',
    departsAt: '14:30',
    capacity: 49,
    seatsLeft: 22,
    fare: 150,
  },
  {
    id: 'vr-0877-23',
    from: accraCircle,
    to: kumasiAsafo,
    plate: 'VR 0877-23',
    operator: 'Volta Star',
    busType: 'Air-conditioned coach',
    status: 'scheduled',
    departsAt: '17:00',
    capacity: 49,
    seatsLeft: 44,
    fare: 145,
  },
  {
    id: 'gw-5521-24',
    from: accraCircle,
    to: kumasiAsafo,
    plate: 'GW 5521-24',
    operator: 'Ashanti Link',
    busType: 'Standard bus',
    status: 'full',
    bay: 3,
    capacity: 49,
    seatsLeft: 0,
    fare: 120,
  },
  {
    id: 'gr-6610-21',
    from: accraCircle,
    to: kumasiAsafo,
    plate: 'GR 6610-21',
    operator: 'Volta Star',
    busType: 'Standard bus',
    status: 'departed',
    departsAt: '11:05',
    capacity: 49,
    seatsLeft: 0,
    fare: 120,
  },
]

/** Buses shown on the home page "Loading now" strip. */
export const loadingNow: Trip[] = [
  trips[0],
  {
    id: 'gw-2290-23',
    from: accraCircle,
    to: { city: 'Cape Coast', name: 'Kotokuraba' },
    plate: 'GW 2290-23',
    operator: 'Coastline Express',
    busType: 'Air-conditioned coach',
    status: 'loading',
    bay: 2,
    capacity: 49,
    seatsLeft: 27,
    fare: 90,
  },
  {
    id: 'as-1108-25',
    from: accraCircle,
    to: { city: 'Ho', name: 'Main station' },
    plate: 'AS 1108-25',
    operator: 'Volta Star',
    busType: 'Standard bus',
    status: 'scheduled',
    departsAt: '14:30',
    capacity: 49,
    seatsLeft: 38,
    fare: 80,
  },
]

export const operators = ['Coastline Express', 'Ashanti Link', 'Volta Star']
export const busTypes = ['Air-conditioned coach', 'Standard bus', 'Minibus'] as const

/** Seat numbers that are free / being paid for on the demo bus; everything else is taken. */
export const demoSeatMap = {
  free: [3, 14, 15, 30, 37, 48],
  held: [22, 41],
}

export const operatorTrips: Array<{
  route: string
  plate: string
  when: string
  status: TripStatus
  sold: number
  capacity: number
  fare: number
}> = [
  { route: 'Accra → Kumasi', plate: 'GR 4471-24', when: 'When full', status: 'loading', sold: 41, capacity: 49, fare: 150 },
  { route: 'Accra → Kumasi', plate: 'GR 1190-25', when: '14:30', status: 'scheduled', sold: 27, capacity: 49, fare: 150 },
  { route: 'Accra → Cape Coast', plate: 'GW 2290-23', when: 'When full', status: 'loading', sold: 22, capacity: 49, fare: 90 },
  { route: 'Accra → Takoradi', plate: 'GR 3015-24', when: '15:00', status: 'scheduled', sold: 12, capacity: 49, fare: 130 },
  { route: 'Accra → Kumasi', plate: 'GR 6610-21', when: '09:00', status: 'departed', sold: 49, capacity: 49, fare: 150 },
  { route: 'Accra → Tamale', plate: 'GR 7742-25', when: '06:00', status: 'departed', sold: 46, capacity: 49, fare: 280 },
]

/** Payments that failed or timed out today; their seats went back on sale. */
export const failedPaymentsToday = 3

/** Bays the signed-in agent looks after, and the trip loading at each (null: empty bay). */
export const agentBays: Record<number, string | null> = {
  6: 'gr-4471-24',
  5: null,
  4: null,
}

export const bayQueue = [
  { plate: 'GR 1190-25', city: 'Kumasi', note: 'Scheduled 14:30 · 27 sold online', next: true },
  { plate: 'AS 3302-22', city: 'Kumasi', note: 'Fill-and-go · 18 sold', next: false },
  { plate: 'VR 0877-23', city: 'Kumasi', note: 'Scheduled 17:00 · 5 sold online', next: false },
]

export function findTrip(id: string | undefined): Trip | undefined {
  return [...trips, ...loadingNow].find((t) => t.id === id)
}
