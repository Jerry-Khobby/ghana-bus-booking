import { Logger } from '@nestjs/common';
import type { EmailMessage, Mailer } from '../mailer.js';

/** Development mailer: prints each email to the console instead of sending. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mail');

  async send(message: EmailMessage): Promise<void> {
    const images = message.attachments?.length
      ? ` (+${message.attachments.length} image)`
      : '';
    this.logger.log(
      `To ${message.to}: ${message.subject}${images}\n${message.text}`,
    );
  }
}
