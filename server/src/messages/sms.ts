import { Logger } from '@nestjs/common';

/**
 * SMS is paid per message in Ghana, so only a log provider exists. A real
 * provider plugs in behind this interface without touching booking code.
 */
export interface SmsProvider {
  send(to: string, text: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export class LogSmsProvider implements SmsProvider {
  private readonly logger = new Logger('Sms');

  async send(to: string, text: string): Promise<void> {
    this.logger.log(`To ${to}: ${text}`);
  }
}
