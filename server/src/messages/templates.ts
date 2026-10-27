import { cedis, departureLine, place } from '../common/format.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface Station {
  name: string;
  city: string;
}

export interface TicketEmailData {
  code: string;
  seatLabel: string;
  passengerName: string | null;
  totalPesewas: number;
  operatorName: string;
  origin: Station;
  destination: Station;
  busPlate: string;
  bayNumber: number;
  mode: 'FIXED_TIME' | 'WHEN_FULL';
  departureAt: Date | null;
  loadingStartsAt: Date | null;
  leaveBy: Date | null;
  ticketUrl: string;
}

export interface LateRefundData {
  code: string;
  passengerName: string | null;
  totalPesewas: number;
  origin: Station;
  destination: Station;
}

/** Template names stored on OutboundMessage.template. */
export type TemplateName = 'otp' | 'ticket' | 'late-refund';

/** Everything user-supplied goes through this before it reaches the HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const greeting = (name: string | null) =>
  name ? `Hi ${name.split(' ')[0]},` : 'Hi,';

function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Helvetica,Arial,sans-serif;color:#1f2328">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
${body}
<p style="margin:24px 0 0;font-size:12px;color:#5c6470">Seatline · bus tickets across Ghana</p>
</div></body></html>`;
}

const row = (label: string, value: string) =>
  `<tr><td style="padding:4px 16px 4px 0;color:#5c6470">${label}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`;

/** Sent when a booking is confirmed. The QR is attached inline as cid:qr. */
export function ticketEmail(data: TicketEmailData): RenderedEmail {
  const route = `${data.origin.city} → ${data.destination.city}`;
  const when = departureLine(data);
  const details: [string, string][] = [
    ['From', place(data.origin)],
    ['To', place(data.destination)],
    ['Leaves', when],
    ['Bay', String(data.bayNumber)],
    ['Seat', data.seatLabel],
    ['Bus', data.busPlate],
    ['Paid', cedis(data.totalPesewas)],
  ];

  const html = layout(`
<p style="margin:0 0 4px;font-size:12px;color:#5c6470;letter-spacing:1px">${escapeHtml(data.operatorName.toUpperCase())}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(route)}</h1>
<p style="margin:0 0 16px">${escapeHtml(greeting(data.passengerName))} your seat is booked. Show this QR code to the agent at bay ${data.bayNumber} to board.</p>
<p style="text-align:center;margin:0"><img src="cid:qr" width="200" height="200" alt="Boarding QR code"></p>
<p style="text-align:center;margin:8px 0 16px;font-size:18px;font-weight:bold;letter-spacing:1px">${escapeHtml(data.code)}</p>
<table style="border-collapse:collapse;font-size:14px">${details.map(([l, v]) => row(l, v)).join('')}</table>
<p style="margin:24px 0 0"><a href="${escapeHtml(data.ticketUrl)}" style="display:inline-block;background:#1f6f4a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Open your ticket</a></p>
<p style="margin:12px 0 0;font-size:13px;color:#5c6470">One ticket boards once. Keep this email; the link works until a week after your trip.</p>`);

  const text = [
    greeting(data.passengerName),
    '',
    `Your ${data.operatorName} ticket ${data.code}: ${route}, seat ${data.seatLabel}.`,
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    `Open your ticket and boarding QR: ${data.ticketUrl}`,
  ].join('\n');

  return {
    subject: `Your Seatline ticket ${data.code} · ${route}, seat ${data.seatLabel}`,
    html,
    text,
  };
}

/**
 * The sign-in code. It's in the subject so it shows in the phone's
 * notification without opening the email.
 */
export function otpEmail(code: string, minutesValid: number): RenderedEmail {
  return {
    subject: `Your Seatline code: ${code}`,
    html: layout(`
<h1 style="margin:0 0 16px;font-size:20px">Your sign-in code</h1>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px">${escapeHtml(code)}</p>
<p style="margin:0 0 12px">Enter it in Seatline to sign in. It works for ${minutesValid} minutes.</p>
<p style="margin:0;font-size:13px;color:#5c6470">If you didn't ask for this, ignore this email. Nobody can sign in without the code.</p>`),
    text: [
      `Your Seatline sign-in code is ${code}.`,
      `It works for ${minutesValid} minutes.`,
      '',
      "If you didn't ask for this, ignore this email.",
    ].join('\n'),
  };
}

/** Sent when a payment lands after the seat was sold to someone else. */
export function lateRefundEmail(data: LateRefundData): RenderedEmail {
  const route = `${data.origin.city} → ${data.destination.city}`;
  const amount = cedis(data.totalPesewas);
  const apology =
    `Your payment of ${amount} for ${route} (booking ${data.code}) reached us ` +
    'after your seat hold ran out, and the seat had already been sold. ' +
    "We're sorry. We're refunding the full amount to the account you paid from.";

  return {
    subject: "We're refunding your Seatline payment",
    html: layout(`
<h1 style="margin:0 0 16px;font-size:20px">We're refunding your payment</h1>
<p style="margin:0 0 12px">${escapeHtml(greeting(data.passengerName))}</p>
<p style="margin:0 0 12px">${escapeHtml(apology)}</p>
<p style="margin:0">You don't need to do anything. Refunds usually arrive within a few working days.</p>`),
    text: [
      greeting(data.passengerName),
      '',
      apology,
      '',
      "You don't need to do anything. Refunds usually arrive within a few working days.",
    ].join('\n'),
  };
}
