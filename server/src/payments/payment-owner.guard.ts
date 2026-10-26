import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { HOLD_TOKEN_HEADER } from '../bookings/hold-token.guard.js';
import { holdTokenMatches } from '../bookings/hold-token.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * `/payments/:id` belongs to whoever holds the booking: the same X-Hold-Token
 * that took the seat. A wrong token looks like a missing payment.
 * TODO(phase 4): also accept the signed-in passenger who owns the booking.
 */
@Injectable()
export class PaymentOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const id = request.params.id;
    const token = request.header(HOLD_TOKEN_HEADER);

    if (typeof id !== 'string' || !isUUID(id)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Validation failed (uuid is expected)',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!token) {
      throw new AppException(
        'UNAUTHENTICATED',
        'Send the hold token in the X-Hold-Token header',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { booking: { select: { holdTokenHash: true } } },
    });
    const hash = payment?.booking.holdTokenHash;
    if (!hash || !holdTokenMatches(token, hash)) {
      throw new AppException(
        'NOT_FOUND',
        'Payment not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return true;
  }
}
