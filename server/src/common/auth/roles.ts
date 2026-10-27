import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { StaffRole } from '../../generated/prisma/enums.js';
import { AppException } from '../errors/app.exception.js';

const ROLES = 'staffRoles';

/**
 * Staff routes: who may call them. @Roles() with no roles means any signed-in
 * staff member. Use with @UseGuards(RolesGuard).
 */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<Request>();
    if (user?.typ !== 'staff') {
      throw new AppException('FORBIDDEN', 'Staff only', HttpStatus.FORBIDDEN);
    }
    const roles =
      this.reflector.getAllAndOverride<StaffRole[]>(ROLES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (roles.length && !roles.includes(user.role)) {
      throw new AppException(
        'ROLE_NOT_ALLOWED',
        'Your role cannot do this',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
