import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, Mailer } from '../mailer.js';

/**
 * Sends through Gmail SMTP with a Google app password (needs 2-step
 * verification on the account). Free, with a daily cap far above demo use.
 */
export class GmailMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    user: string,
    appPassword: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass: appPassword },
      // Fail in seconds, not minutes, when SMTP can't be reached (Render's
      // free plan blocks it): the outbox keeps the email for the tick
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        cid: a.cid,
      })),
    });
  }
}
