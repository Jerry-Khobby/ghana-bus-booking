import { HttpStatus } from '@nestjs/common';
import type { StaffUser } from '../common/auth/auth-user.js';
import { AppException } from '../common/errors/app.exception.js';

/**
 * Who is acting, for every admin service method. Rows are always looked up
 * with this operatorId, so another operator's ids are simply NOT_FOUND.
 */
export interface AdminContext {
  operatorId: string;
  staffId: string;
  ip?: string;
}

export function adminContext(user: StaffUser, ip?: string): AdminContext {
  if (!user.op) {
    throw new AppException(
      'FORBIDDEN',
      'Only operator staff can do this',
      HttpStatus.FORBIDDEN,
    );
  }
  return { operatorId: user.op, staffId: user.sub, ip };
}

export function notFound(what: string) {
  return new AppException(
    'NOT_FOUND',
    `${what} not found`,
    HttpStatus.NOT_FOUND,
  );
}

/** VALIDATION_FAILED pointing at one field, like the global pipe's errors. */
export function invalidField(field: string, message: string) {
  return new AppException(
    'VALIDATION_FAILED',
    'Some fields are invalid',
    HttpStatus.BAD_REQUEST,
    { fields: { [field]: [message] } },
  );
}

/** The audit row every admin change writes. */
export function auditEntry(
  ctx: AdminContext,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
) {
  return {
    operatorId: ctx.operatorId,
    actorType: 'STAFF' as const,
    actorId: ctx.staffId,
    action,
    entityType,
    entityId,
    before,
    after,
    ip: ctx.ip,
  };
}
