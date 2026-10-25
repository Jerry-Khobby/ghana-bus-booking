import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { holdTokenMatches } from './hold-token.js';

export const HOLD_TOKEN_HEADER = 'x-hold-token';

/**
 * Lets only the hold's owner read or release it (`/holds/:id`). A wrong token
 * gets the same NOT_FOUND as a missing hold, so ids can't be probed.
 * TODO(phase 4): also accept a signed-in passenger who owns the booking.
 */
@Injectable()
export class HoldTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const id = request.params.id;
    const token = request.header(HOLD_TOKEN_HEADER);

    // Guards run before pipes, so the id hasn't been checked yet
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

    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: { holdTokenHash: true },
    });
    if (
      !booking?.holdTokenHash ||
      !holdTokenMatches(token, booking.holdTokenHash)
    ) {
      throw new AppException(
        'NOT_FOUND',
        'Hold not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return true;
  }
}
