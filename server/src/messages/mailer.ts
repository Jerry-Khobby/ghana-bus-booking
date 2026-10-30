/** Injection token for the active mailer (MAIL_PROVIDER=log|gmail|brevo). */
export const MAILER = Symbol('MAILER');

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Inline images, referenced from the HTML as cid:<cid>. */
  attachments?: { filename: string; content: Buffer; cid: string }[];
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}
