import { Logger, Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { MAILER } from './mailer.js';
import { GmailMailer } from './mailers/gmail.mailer.js';
import { LogMailer } from './mailers/log.mailer.js';
import { MessagesService } from './messages.service.js';
import { LogSmsProvider, SMS_PROVIDER } from './sms.js';

// Email templates, the outbox and sending through the Mailer; SMS interface
// for later.
// Writes: OutboundMessage
// Routes: none
@Module({
  imports: [TicketsModule],
  providers: [
    MessagesService,
    {
      provide: MAILER,
      useFactory: () => {
        const provider = process.env.MAIL_PROVIDER ?? 'log';
        if (provider === 'gmail') {
          const user = process.env.GMAIL_USER?.trim();
          const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
          if (!user || !password) {
            throw new Error(
              'MAIL_PROVIDER=gmail needs GMAIL_USER and GMAIL_APP_PASSWORD',
            );
          }
          return new GmailMailer(
            user,
            password,
            process.env.MAIL_FROM ?? `Seatline <${user}>`,
          );
        }
        if (provider === 'log') {
          new Logger('Mail').log('MAIL_PROVIDER=log: emails print here');
          return new LogMailer();
        }
        throw new Error(`Unknown MAIL_PROVIDER "${provider}"`);
      },
    },
    { provide: SMS_PROVIDER, useClass: LogSmsProvider },
  ],
  exports: [MessagesService, SMS_PROVIDER],
})
export class MessagesModule {}
