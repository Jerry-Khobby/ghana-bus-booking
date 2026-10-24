import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service.js';

// Email templates and sending through the Mailer; SmsProvider interface for later.
// Writes: OutboundMessage
// Routes: none
@Module({
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
