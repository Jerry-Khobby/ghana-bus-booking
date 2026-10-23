import type { PassengerTicket } from './types'

/** Sample "My tickets" history for the signed-in demo passenger (Ama K.). */
export const passengerTickets: PassengerTicket[] = [
  { code: 'SL-7Q4K-2M', tripId: 'gr-4471-24', route: 'Accra → Kumasi', when: 'Today · leaves when full', seat: 14, plate: 'GR 4471-24', paid: 155, state: 'loading', bay: 6 },
  { code: 'SL-3HW9-8D', tripId: 'gw-2290-23', route: 'Accra → Cape Coast', when: 'Sat 24 Oct · departs 06:30 · bay 2', seat: 7, plate: 'GW 2290-23', paid: 95, state: 'scheduled', bay: 2 },
  { code: 'SL-9KD2-4P', route: 'Kumasi → Accra', when: 'Sun 11 Oct · boarded 07:12', seat: 22, plate: 'AS 3302-22', paid: 125, state: 'used', note: 'Boarded and scanned' },
  { code: 'SL-2PL7-1C', route: 'Accra → Kumasi', when: 'Fri 9 Oct · boarded 14:31', seat: 5, plate: 'GR 1190-25', paid: 155, state: 'used', note: 'Boarded and scanned' },
  { code: 'SL-6TT3-0A', route: 'Accra → Ho', when: 'Mon 28 Sep · departed 11:00', seat: 31, plate: 'VR 0877-23', paid: 85, state: 'not-used', note: 'Bus left without this ticket being scanned' },
]
