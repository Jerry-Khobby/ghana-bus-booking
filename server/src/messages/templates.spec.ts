import { escapeHtml, lateRefundEmail, ticketEmail } from './templates.js';

const base = {
  code: 'SL-7Q4K-2M',
  seatLabel: '14',
  passengerName: 'Ama Mensah',
  totalPesewas: 15_100,
  operatorName: 'Coastline Express',
  origin: { name: 'Circle', city: 'Accra' },
  destination: { name: 'Asafo', city: 'Kumasi' },
  busPlate: 'GR 4471-24',
  bayNumber: 6,
  mode: 'FIXED_TIME' as const,
  departureAt: new Date('2026-10-27T14:30:00Z'),
  loadingStartsAt: new Date('2026-10-27T13:30:00Z'),
  leaveBy: null,
  ticketUrl: 'http://localhost:5173/ticket/SL-7Q4K-2M?t=123.abc',
};

describe('ticketEmail', () => {
  it('has the subject the plan gives and everything needed to board', () => {
    const email = ticketEmail(base);

    expect(email.subject).toBe(
      'Your Seatline ticket SL-7Q4K-2M · Accra → Kumasi, seat 14',
    );
    expect(email.html).toContain('src="cid:qr"');
    expect(email.html).toContain(base.ticketUrl);
    expect(email.text).toContain('Leaves: Tue, 27 Oct 2026 at 14:30');
    expect(email.text).toContain('Bay: 6');
    expect(email.text).toContain('Paid: GH¢ 151.00');
    expect(email.text.startsWith('Hi Ama,')).toBe(true);
  });

  it('escapes what passengers typed', () => {
    const email = ticketEmail({
      ...base,
      passengerName: '<script>alert(1)</script>',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('describes fill-and-go departures', () => {
    const email = ticketEmail({
      ...base,
      mode: 'WHEN_FULL',
      departureAt: null,
      leaveBy: new Date('2026-10-27T16:00:00Z'),
    });
    expect(email.text).toContain(
      'Leaves: Tue, 27 Oct 2026, leaves when full, by 16:00 at the latest',
    );
  });
});

describe('lateRefundEmail', () => {
  it('apologises and states the refund amount', () => {
    const email = lateRefundEmail({
      code: 'SL-7Q4K-2M',
      passengerName: null,
      totalPesewas: 15_100,
      origin: { name: 'Circle', city: 'Accra' },
      destination: { name: 'Asafo', city: 'Kumasi' },
    });
    expect(email.subject).toBe("We're refunding your Seatline payment");
    expect(email.text).toContain('GH¢ 151.00');
    expect(email.text.startsWith('Hi,')).toBe(true);
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
