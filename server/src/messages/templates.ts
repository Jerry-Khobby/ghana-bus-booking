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
export type TemplateName =
  | 'otp'
  | 'ticket'
  | 'late-refund'
  | 'trip-changed'
  | 'trip-cancelled'
  | 'staff-invite'
  | 'staff-reset';

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

export interface TripChangedData {
  code: string;
  passengerName: string | null;
  origin: Station;
  destination: Station;
  /** The new departure, in the ticket's words. */
  newDeparture: string;
  seatLabel: string;
  bayNumber: number;
  ticketUrl: string;
}

/** Sent to confirmed passengers when an admin moves the departure. */
export function tripChangedEmail(data: TripChangedData): RenderedEmail {
  const route = `${data.origin.city} → ${data.destination.city}`;
  const line = `Your ${route} bus now leaves ${data.newDeparture}.`;
  return {
    subject: `Your ${route} bus now leaves ${data.newDeparture}`,
    html: layout(`
<h1 style="margin:0 0 16px;font-size:20px">Your bus time has changed</h1>
<p style="margin:0 0 12px">${escapeHtml(greeting(data.passengerName))} ${escapeHtml(line)}</p>
<p style="margin:0 0 12px">Your ticket ${escapeHtml(data.code)} still works: seat ${escapeHtml(data.seatLabel)}, bay ${data.bayNumber}.</p>
<p style="margin:16px 0 0"><a href="${escapeHtml(data.ticketUrl)}" style="display:inline-block;background:#1f6f4a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Open your ticket</a></p>`),
    text: [
      greeting(data.passengerName),
      '',
      line,
      `Your ticket ${data.code} still works: seat ${data.seatLabel}, bay ${data.bayNumber}.`,
      `Open your ticket: ${data.ticketUrl}`,
    ].join('\n'),
  };
}

export interface TripCancelledData {
  code: string;
  passengerName: string | null;
  origin: Station;
  destination: Station;
  totalPesewas: number;
  /** online: refunded to the account; cash: collect it at the station. */
  refund: 'online' | 'cash';
}

/** Sent to every affected passenger when an admin cancels the trip. */
export function tripCancelledEmail(data: TripCancelledData): RenderedEmail {
  const route = `${data.origin.city} → ${data.destination.city}`;
  const amount = cedis(data.totalPesewas);
  const refund =
    data.refund === 'online'
      ? `We're refunding ${amount} to the account you paid from; it usually arrives within a few working days.`
      : `Bring this email or your ticket ${data.code} to the station to collect your ${amount}.`;
  const line = `Your ${route} trip (ticket ${data.code}) has been cancelled. We're sorry.`;
  return {
    subject:
      data.refund === 'online'
        ? `Your ${route} trip is cancelled; your refund is on its way`
        : `Your ${route} trip is cancelled`,
    html: layout(`
<h1 style="margin:0 0 16px;font-size:20px">Your trip is cancelled</h1>
<p style="margin:0 0 12px">${escapeHtml(greeting(data.passengerName))} ${escapeHtml(line)}</p>
<p style="margin:0">${escapeHtml(refund)}</p>`),
    text: [greeting(data.passengerName), '', line, refund].join('\n'),
  };
}

const button = (url: string, label: string) =>
  `<p style="margin:16px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1f6f4a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${label}</a></p>`;

/** An admin invited a new agent. The link is valid for 7 days. */
export function staffInviteEmail(data: {
  name: string;
  operatorName: string;
  url: string;
}): RenderedEmail {
  const line = `${data.operatorName} has invited you to sell and scan tickets on Seatline.`;
  return {
    subject: "You're invited to Seatline (link valid 7 days)",
    html: layout(`
<h1 style="margin:0 0 16px;font-size:20px">You're invited to Seatline</h1>
<p style="margin:0 0 12px">${escapeHtml(greeting(data.name))} ${escapeHtml(line)}</p>
<p style="margin:0">Set your password to get started. The link works for 7 days.</p>
${button(data.url, 'Set your password')}`),
    text: [
      greeting(data.name),
      '',
      line,
      `Set your password (link valid 7 days): ${data.url}`,
    ].join('\n'),
  };
}

/** An admin reset a staff member's password. The link is valid for 1 hour. */
export function staffResetEmail(data: {
  name: string;
  url: string;
}): RenderedEmail {
  return {
    subject: 'Reset your Seatline password (link valid 1 hour)',
    html: layout(`
<h1 style="margin:0 0 16px;font-size:20px">Reset your password</h1>
<p style="margin:0 0 12px">${escapeHtml(greeting(data.name))} your admin asked for a new password for your Seatline account.</p>
<p style="margin:0">The link works for 1 hour. If you didn't expect this, tell your admin.</p>
${button(data.url, 'Set a new password')}`),
    text: [
      greeting(data.name),
      '',
      'Your admin asked for a new password for your Seatline account.',
      `Set a new password (link valid 1 hour): ${data.url}`,
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
