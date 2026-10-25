import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes.js';

/**
 * The error every service throws. The global filter turns it into
 * `{ error: { code, message, details } }`.
 *
 *   throw new AppException('SEAT_TAKEN', 'Seat 14 was just taken', HttpStatus.CONFLICT);
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message, status);
  }
}
