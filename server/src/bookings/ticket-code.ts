import { randomInt } from 'node:crypto';

// Crockford base32 without 0 and 1, so codes read aloud at a bus station can't
// be confused with O and I (which Crockford already leaves out).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A human ticket code like "SL-7Q4K-2M". Booking.code is unique, so retry on a clash. */
export function generateTicketCode(): string {
  const pick = (length: number) =>
    Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `SL-${pick(4)}-${pick(2)}`;
}
