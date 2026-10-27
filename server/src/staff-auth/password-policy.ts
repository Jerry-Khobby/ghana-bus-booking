import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { COMMON_PASSWORDS } from './common-passwords.js';

export const MIN_PASSWORD_LENGTH = 10;

/** Throws WEAK_PASSWORD for passwords under 10 characters or too common. */
export function checkPassword(password: string, email?: string): void {
  const lower = password.toLowerCase();
  const reason =
    password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters`
      : COMMON_PASSWORDS.has(lower)
        ? 'That password is too common. Pick another.'
        : email && lower.includes(email.split('@')[0].toLowerCase())
          ? "Don't use your email address in your password"
          : null;
  if (reason) {
    throw new AppException('WEAK_PASSWORD', reason, HttpStatus.BAD_REQUEST);
  }
}
