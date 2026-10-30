import type { EmailMessage, Mailer } from '../mailer.js';

const API = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 15_000;

/**
 * Sends through Brevo's HTTPS API. Render's free plan blocks SMTP, so Gmail
 * can't send from there; this goes over port 443 like any web request.
 * Free: 300 emails a day, from a sender address verified in Brevo (a Gmail
 * address works, no domain needed).
 *
 * Brevo doesn't document inline (cid:) images, so the ticket's QR goes as an
 * ordinary attachment; the email's "Open your ticket" link shows it too.
 */
export class BrevoMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    /** "Seatline <you@gmail.com>" or just the address. */
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseAddress(this.from),
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: withoutInlineImages(message.html, message.attachments),
        textContent: message.text,
        ...(message.attachments?.length && {
          attachment: message.attachments.map((a) => ({
            name: a.filename,
            content: a.content.toString('base64'),
          })),
        }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Brevo explains itself in { code, message }; never echo the key
      const body = (await res.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      throw new Error(
        `Brevo refused the email (${res.status}${body?.code ? ` ${body.code}` : ''}): ${body?.message ?? res.statusText}`,
      );
    }
  }
}

/** "Seatline <you@gmail.com>" → { name, email }; a bare address works too. */
export function parseAddress(value: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = match[1].replace(/^"|"$/g, '').trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

/** Swaps <img src="cid:…"> for a line saying the image is attached. */
export function withoutInlineImages(
  html: string,
  attachments: EmailMessage['attachments'],
): string {
  if (!attachments?.length) return html;
  return html.replace(
    /<img[^>]*src="cid:([^"]+)"[^>]*>/g,
    (_img, cid: string) => {
      const file = attachments.find((a) => a.cid === cid)?.filename;
      return file
        ? `<span style="color:#5c6470">Your boarding QR code is attached (${file}), and on your ticket page.</span>`
        : '';
    },
  );
}
