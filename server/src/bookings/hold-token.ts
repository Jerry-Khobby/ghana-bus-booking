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
