import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception.js';
import type { AuthUser } from './auth-user.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * Global guard. Reads the Bearer access token when one is sent and puts its
 * claims on request.user. Every route needs a valid token unless it is marked
 * @Public(); on public routes a stale token is ignored and the caller is a
 * guest, so an expired session never breaks search or booking.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      try {
        request.user = await this.jwt.verifyAsync<AuthUser>(token);
      } catch {
        if (!isPublic) throw unauthenticated('Your session has expired');
      }
    }
    if (!isPublic && !request.user) {
      throw unauthenticated('Sign in to continue');
    }
    return true;
  }
}

function unauthenticated(message: string) {
  return new AppException('UNAUTHENTICATED', message, HttpStatus.UNAUTHORIZED);
}
