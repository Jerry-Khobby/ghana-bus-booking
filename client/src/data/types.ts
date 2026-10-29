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
  /** Bay the bus loads at. */
  bay?: number
  /** Fill-and-go: leaves once every seat is sold (or at leaveBy). */
  whenFull?: boolean
  /** "HH:MM" for fixed departures; undefined means it leaves when full. */
  departsAt?: string
  /** "HH:MM" when boarding starts. */
  loadsAt?: string
  /** "HH:MM" a fill-and-go bus leaves by, even if not full. */
  leaveBy?: string
  /** Human estimate for fill-and-go buses, e.g. "about 20 min". */
  eta?: string
  capacity: number
  seatsLeft: number
  /** Fare in Ghana cedis. */
  fare: number
  /** The operator's service fee per online seat, in cedis, when known. */
  fee?: number
}

export type PaymentMethod = 'momo' | 'card'

export type MomoNetwork = 'MTN' | 'Telecel' | 'AT'

export interface SeatLayout {
  /** Seats left of the aisle per row. */
  left: number
  /** Seats right of the aisle per row. */
  right: number
  rows: number
  /** Full-width back row with one extra seat over the aisle. */
  backRow: boolean
}

export interface Ticket {
  code: string
  tripId: string
  seat: number
  passengerName: string
  phone: string
}

/* ---------- Passenger account ---------- */

export type TicketState = 'loading' | 'scheduled' | 'used' | 'not-used'

/** A ticket in "My tickets". Upcoming ones link to the QR pass. */
export interface PassengerTicket {
  code: string
  tripId?: string
  route: string
  when: string
  seat: string
  plate: string
  paid: number
  state: TicketState
  bay?: number
  /** Shown instead of the QR link once the ticket can no longer be used. */
  note?: string
}

/* ---------- Operator ---------- */

export interface OperatorTrip {
  id: string
  route: string
  plate: string
  /** "14:30", "When full", "Leaving now" */
  when: string
  bay: number
  status: TripStatus
  sold: number
  capacity: number
  fare: number
}

export type BusStatus = 'active' | 'workshop'

export interface Bus {
  plate: string
  type: BusType
  layoutId: string
  status: BusStatus
  /** Where the bus is or goes next, e.g. "Loading now · bay 6". */
  next: string
}

export interface LayoutRecord {
  id: string
  name: string
  layout: SeatLayout
}

export interface RouteRecord {
  id: string
  name: string
  stations: string
  tripsToday: number
  fare: number
}

export type AgentStatus = 'active' | 'invited' | 'disabled'

export interface StationAgent {
  id: string
  name: string
  email: string
  station: string
  bays: string
  status: AgentStatus
  lastActive: string
}
