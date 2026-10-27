import type { StaffRole } from '../../generated/prisma/enums.js';

/** A signed-in passenger, from the access token. */
export interface PassengerUser {
  typ: 'passenger';
  /** Passenger id */
  sub: string;
}

/** A signed-in staff member, from the access token. */
export interface StaffUser {
  typ: 'staff';
  /** StaffUser id */
  sub: string;
  role: StaffRole;
  /** Operator id; null for platform admins. */
  op: string | null;
  /** Agent's station id. */
  stn: string | null;
}

export type AuthUser = PassengerUser | StaffUser;

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by JwtAuthGuard when a valid access token is sent. */
    user?: AuthUser;
  }
}
