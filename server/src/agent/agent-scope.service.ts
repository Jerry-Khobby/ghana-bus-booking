import { HttpStatus, Injectable } from '@nestjs/common';
import type { StaffUser } from '../common/auth/auth-user.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { StaffRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The tenant and bay rules for every agent route (the plan's AgentBayGuard):
 * an agent works only the bays assigned to them; an operator admin works every
 * bay of their own operator. Anything outside that is NOT_FOUND, not
 * FORBIDDEN, so ids from other operators reveal nothing.
 */
@Injectable()
export class AgentScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** The bays this staff member works, lowest number first. */
  async bays(user: StaffUser) {
    if (!user.op) return [];
    const where: Prisma.BayWhereInput =
      user.role === StaffRole.AGENT
        ? { operatorId: user.op, agents: { some: { staffUserId: user.sub } } }
        : { operatorId: user.op };
    return this.prisma.bay.findMany({
      where,
      select: {
        id: true,
        number: true,
        station: { select: { id: true, name: true, city: true } },
      },
      orderBy: [{ station: { city: 'asc' } }, { number: 'asc' }],
    });
  }

  /** Where clause for trips this staff member may touch. */
  async tripWhere(user: StaffUser): Promise<Prisma.TripWhereInput> {
    const bayIds = (await this.bays(user)).map((b) => b.id);
    return { operatorId: user.op ?? '-', bayId: { in: bayIds } };
  }

  /** The trip if it's at one of the caller's bays, else NOT_FOUND. */
  async trip<S extends Prisma.TripSelect>(
    user: StaffUser,
    tripId: string,
    select: S,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, ...(await this.tripWhere(user)) },
      select,
    });
    if (!trip) throw notFound('Trip not found');
    return trip;
  }

  /** A booking (by ticket code) on a trip at one of the caller's bays. */
  async booking<S extends Prisma.BookingSelect>(
    user: StaffUser,
    code: string,
    select: S,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { code, trip: await this.tripWhere(user) },
      select,
    });
    if (!booking) throw notFound('Ticket not found');
    return booking;
  }
}

export function notFound(message: string) {
  return new AppException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
}
