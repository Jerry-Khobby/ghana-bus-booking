export type TripStatus = 'loading' | 'scheduled' | 'full' | 'departed'

export type SeatStatus = 'free' | 'mine' | 'held' | 'taken'

export type BusType = 'Air-conditioned coach' | 'Standard bus' | 'Minibus'

export interface Station {
  city: string
  name: string
}

export interface Trip {
  id: string
  from: Station
  to: Station
  plate: string
  operator: string
  busType: BusType
  status: TripStatus
  /** Bay the bus is loading at, if any. */
  bay?: number
  /** "HH:MM" for scheduled departures; undefined means it leaves when full. */
  departsAt?: string
  /** Human estimate for fill-and-go buses, e.g. "about 20 min". */
  eta?: string
  capacity: number
  seatsLeft: number
  /** Fare in Ghana cedis. */
  fare: number
}

export type PaymentMethod = 'momo' | 'card'

export type MomoNetwork = 'MTN' | 'Telecel' | 'AT'

export interface Ticket {
  code: string
  tripId: string
  seat: number
  passengerName: string
  phone: string
}
