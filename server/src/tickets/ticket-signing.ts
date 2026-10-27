import { createHmac, timingSafeEqual } from 'node:crypto';

// ─── QR payload ──────────────────────────────────────────────────────────────
// SL1.<code>.<trip>.<signature>: the agent's scanner checks it offline-friendly
// and it can't be forged without QR_SIGNING_SECRET. A copied QR of a real
// ticket still verifies, so "one ticket, one boarding" comes from the BOARDED
// status, not from the QR. Changing qrNonce kills every old QR for a booking.

const QR_VERSION = 'SL1';

/** Last 8 hex digits of the trip id: the random end of a UUID v7. */
export function shortTripId(tripId: string): string {
  return tripId.replace(/-/g, '').slice(-8);
}

function qrSignature(
  secret: string,
  code: string,
  tripId: string,
  qrNonce: string,
) {
  return createHmac('sha256', secret)
    .update(`${code}|${tripId}|${qrNonce}`)
    .digest()
    .subarray(0, 16)
    .toString('base64url');
}

export function signQrPayload(
  secret: string,
  booking: { code: string; tripId: string; qrNonce: string },
): string {
  const signature = qrSignature(
    secret,
    booking.code,
    booking.tripId,
    booking.qrNonce,
  );
  return `${QR_VERSION}.${booking.code}.${shortTripId(booking.tripId)}.${signature}`;
}

/** The ticket code a QR claims, before its signature is checked. */
export function parseQrPayload(payload: string) {
  const [version, code, trip, signature, ...rest] = payload.trim().split('.');
  if (version !== QR_VERSION || !code || !trip || !signature || rest.length) {
    return null;
  }
  return { code, trip, signature };
}

/** True if the QR was issued for this booking and hasn't been rotated. */
export function verifyQrPayload(
  secret: string,
  payload: string,
  booking: { code: string; tripId: string; qrNonce: string },
): boolean {
  const parsed = parseQrPayload(payload);
  if (
    !parsed ||
    parsed.code !== booking.code ||
    parsed.trip !== shortTripId(booking.tripId)
  ) {
    return false;
  }
  return safeEqual(
    parsed.signature,
    qrSignature(secret, booking.code, booking.tripId, booking.qrNonce),
  );
}

// ─── Ticket link token ───────────────────────────────────────────────────────
// The `t` in /tickets/SL-7Q4K-2M?t=… lets a guest open their ticket without an
// account: <expiry in unix seconds>.<HMAC of code|expiry>, with its own secret.

export function signTicketLink(
  secret: string,
  code: string,
  expiresAt: Date,
): string {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  return `${exp}.${linkSignature(secret, code, exp)}`;
}

/** 'ok', or why the link can't be used. */
export function checkTicketLink(
  secret: string,
  code: string,
  token: string,
  now = new Date(),
): 'ok' | 'invalid' | 'expired' {
  const match = /^(\d{1,12})\.([\w-]+)$/.exec(token);
  if (!match) return 'invalid';
  const exp = Number(match[1]);
  if (!safeEqual(match[2], linkSignature(secret, code, exp))) return 'invalid';
  return exp * 1000 < now.getTime() ? 'expired' : 'ok';
}

function linkSignature(secret: string, code: string, exp: number) {
  return createHmac('sha256', secret)
    .update(`${code}|${exp}`)
    .digest('base64url');
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
