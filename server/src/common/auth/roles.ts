import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  OperatorStatus,
  type StaffRole,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AppException } from '../errors/app.exception.js';

const ROLES = 'staffRoles';

/**
 * Staff routes: who may call them. @Roles() with no roles means any signed-in
 * staff member. Use with @UseGuards(RolesGuard). Staff of a suspended
 * operator are refused at once, not when their 15-minute token runs out.
 */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    if (user.op) {
      const operator = await this.prisma.operator.findUnique({
        where: { id: user.op },
        select: { status: true },
      });
      if (operator?.status !== OperatorStatus.ACTIVE) throw operatorSuspended();
    }
    return true;
  }
}

export function operatorSuspended() {
  return new AppException(
    'OPERATOR_SUSPENDED',
    "Your company's Seatline account is suspended. Contact Seatline to restore it.",
    HttpStatus.FORBIDDEN,
  );
}
