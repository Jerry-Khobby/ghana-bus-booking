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
import { ownsBooking } from './hold-token.js';

export const HOLD_TOKEN_HEADER = 'x-hold-token';

/**
 * Lets only the hold's owner read or release it (`/holds/:id`): the guest
 * with its X-Hold-Token, or the signed-in passenger who made it. Anyone else
 * gets the same NOT_FOUND as a missing hold, so ids can't be probed.
 */
@Injectable()
export class HoldTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const id = checkId(request.params.id);
    const token = requireOwnerProof(request);

    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: { holdTokenHash: true, passengerId: true },
    });
    if (!booking || !ownsBooking(booking, token, request.user)) {
      throw new AppException(
        'NOT_FOUND',
        'Hold not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return true;
  }
}

/** Guards run before pipes, so route ids are checked here. */
export function checkId(id: unknown): string {
  if (typeof id !== 'string' || !isUUID(id)) {
    throw new AppException(
      'VALIDATION_FAILED',
      'Validation failed (uuid is expected)',
      HttpStatus.BAD_REQUEST,
    );
  }
  return id;
}

/**
 * The X-Hold-Token, required unless a passenger is signed in. SSE streams
 * can't send headers, so on /stream routes it may come as ?holdToken=.
 */
export function requireOwnerProof(request: Request): string | undefined {
  const fromQuery = request.path.endsWith('/stream')
    ? request.query.holdToken
    : undefined;
  const token =
    request.header(HOLD_TOKEN_HEADER) ??
    (typeof fromQuery === 'string' ? fromQuery : undefined);
  if (!token && request.user?.typ !== 'passenger') {
    throw new AppException(
      'UNAUTHENTICATED',
      'Send the hold token in the X-Hold-Token header, or sign in',
      HttpStatus.UNAUTHORIZED,
    );
  }
  return token;
}
