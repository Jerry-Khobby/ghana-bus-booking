import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Guests don't sign in, so a hold is proved by a random token handed out once
 * when the seat is taken and sent back as `X-Hold-Token`. Only its hash is
 * stored, so a database leak can't be used to cancel someone's hold.
 */
export function createHoldToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashHoldToken(token) };
}

export function hashHoldToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function holdTokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashHoldToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Who may see or act on a booking: whoever holds its hold token, or the
 * signed-in passenger it belongs to. Holds, payments and tickets all use this.
 */
export function ownsBooking(
  booking: { holdTokenHash: string | null; passengerId: string | null },
  holdToken: string | undefined,
  user: { typ: string; sub: string } | undefined,
): boolean {
  if (user?.typ === 'passenger' && booking.passengerId === user.sub) {
    return true;
  }
  return (
    !!holdToken &&
    !!booking.holdTokenHash &&
    holdTokenMatches(holdToken, booking.holdTokenHash)
  );
}
