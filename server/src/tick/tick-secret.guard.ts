import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppException } from '../common/errors/app.exception.js';

/**
 * Only the scheduler may call the tick: X-Tick-Secret must equal TICK_SECRET.
 * With no TICK_SECRET set, the endpoint is closed to everyone.
 */
@Injectable()
export class TickSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = process.env.TICK_SECRET?.trim();
    const given = request.header('x-tick-secret') ?? '';

    const ok =
      !!expected &&
      Buffer.byteLength(given) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) {
      throw new AppException(
        'UNAUTHENTICATED',
        'Wrong or missing X-Tick-Secret',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return true;
  }
}
