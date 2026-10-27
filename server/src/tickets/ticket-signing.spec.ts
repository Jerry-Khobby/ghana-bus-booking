import {
  checkTicketLink,
  parseQrPayload,
  shortTripId,
  signQrPayload,
  signTicketLink,
  verifyQrPayload,
} from './ticket-signing.js';

const SECRET = 'qr-secret';
const booking = {
  code: 'SL-7Q4K-2M',
  tripId: '01a17461-e3f0-7441-8b36-b635e95cc7e9',
  qrNonce: 'nonce-1',
};

describe('QR payload', () => {
  it('is short, readable and verifies', () => {
    const payload = signQrPayload(SECRET, booking);

    expect(payload).toMatch(/^SL1\.SL-7Q4K-2M\.e95cc7e9\.[\w-]{22}$/);
    expect(payload.length).toBeLessThan(70);
    expect(verifyQrPayload(SECRET, payload, booking)).toBe(true);
  });

  it('rejects a forged, altered or rotated QR', () => {
    const payload = signQrPayload(SECRET, booking);

    expect(verifyQrPayload('other-secret', payload, booking)).toBe(false);
    expect(
      verifyQrPayload(SECRET, payload.replace('SL-7Q4K', 'SL-7Q4X'), booking),
    ).toBe(false);
    expect(
      verifyQrPayload(SECRET, payload, { ...booking, qrNonce: 'nonce-2' }),
    ).toBe(false);
    expect(
      verifyQrPayload(SECRET, payload, {
        ...booking,
        tripId: '01a17461-e3f0-7441-8b36-000000000000',
      }),
    ).toBe(false);
    expect(verifyQrPayload(SECRET, 'not a ticket', booking)).toBe(false);
  });

  it('parses the code out before the booking is loaded', () => {
    const payload = signQrPayload(SECRET, booking);
    expect(parseQrPayload(payload)).toMatchObject({
      code: 'SL-7Q4K-2M',
      trip: shortTripId(booking.tripId),
    });
    expect(parseQrPayload('SL2.SL-7Q4K-2M.x.y')).toBeNull();
    expect(parseQrPayload('SL1.a.b.c.d')).toBeNull();
  });
});

describe('ticket link token', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const later = new Date('2026-11-03T12:00:00Z');

  it('opens the ticket it was made for until it expires', () => {
    const token = signTicketLink(SECRET, booking.code, later);

    expect(checkTicketLink(SECRET, booking.code, token, now)).toBe('ok');
    expect(
      checkTicketLink(
        SECRET,
        booking.code,
        token,
        new Date('2026-11-04T00:00:00Z'),
      ),
    ).toBe('expired');
  });

  it("doesn't open another ticket or accept a changed expiry", () => {
    const token = signTicketLink(SECRET, booking.code, later);
    const [, signature] = token.split('.');

    expect(checkTicketLink(SECRET, 'SL-AAAA-BB', token, now)).toBe('invalid');
    expect(
      checkTicketLink(SECRET, booking.code, `9999999999.${signature}`, now),
    ).toBe('invalid');
    expect(checkTicketLink(SECRET, booking.code, 'garbage', now)).toBe(
      'invalid',
    );
  });
});
