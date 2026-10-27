import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { checkId, requireOwnerProof } from '../bookings/hold-token.guard.js';
import { ownsBooking } from '../bookings/hold-token.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * `/payments/:id` belongs to whoever owns the booking: the same X-Hold-Token
 * that took the seat, or the signed-in passenger. Anyone else sees NOT_FOUND.
 */
@Injectable()
export class PaymentOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const id = checkId(request.params.id);
    const token = requireOwnerProof(request);

    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: {
        booking: { select: { holdTokenHash: true, passengerId: true } },
      },
    });
    if (!payment || !ownsBooking(payment.booking, token, request.user)) {
      throw new AppException(
        'NOT_FOUND',
        'Payment not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return true;
  }
}
