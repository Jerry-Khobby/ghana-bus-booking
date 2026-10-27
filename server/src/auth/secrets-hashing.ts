import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

/** A 6-digit sign-in code from a crypto random source, e.g. "048193". */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * What OtpCode.codeHash stores: never the code. The email is mixed in so the
 * same code for two people hashes differently, and the pepper (kept out of
 * the database) means a leaked table can't be brute-forced offline.
 */
export function hashOtp(code: string, email: string, pepper: string): string {
  return sha256(`${code}|${email}|${pepper}`);
}

/** A refresh token handed to the browser in a cookie. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What RefreshToken.tokenHash stores. */
export function hashRefreshToken(token: string, pepper: string): string {
  return sha256(`${token}|${pepper}`);
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
