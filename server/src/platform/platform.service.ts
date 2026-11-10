import { HttpStatus, Injectable } from '@nestjs/common';
import { invalidField, notFound } from '../admin/admin-context.js';
import { AdminTripsService } from '../admin/admin-trips.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { normalizeGhanaPhone } from '../common/phone.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BookingStatus,
  OperatorStatus,
  StaffRole,
  StaffStatus,
  SubjectType,
  TokenType,
  TripStatus,
} from '../generated/prisma/enums.js';
import { MessagesService } from '../messages/messages.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffAuthService } from '../staff-auth/staff-auth.service.js';
import { notLeftYet } from '../trips/trips.service.js';
import {
  CreateOperatorDto,
  CreateStationDto,
  InviteOperatorAdminDto,
  SuspendOperatorDto,
  UpdateOperatorDto,
  UpdateStationDto,
} from './dto/platform.dto.js';

/** Who is acting: platform admins belong to no operator. */
export interface PlatformContext {
  staffId: string;
  ip?: string;
}

// The plan allows showing the link once in the response for testing; never
// in production, where only the email carries it
const SHOW_LINKS = process.env.NODE_ENV !== 'production';

const operatorSelect = {
  id: true,
  name: true,
  slug: true,
  phone: true,
  email: true,
  serviceFeePesewas: true,
  holdMinutes: true,
  status: true,
  createdAt: true,
  _count: { select: { buses: true, routes: true, staff: true } },
} as const;

/** Trips a suspension can still cancel: not gone, not cancelled, not left. */
const upcomingTrips = (
  operatorId: string,
  now: Date,
): Prisma.TripWhereInput => ({
  operatorId,
  status: { in: [TripStatus.SCHEDULED, TripStatus.LOADING, TripStatus.FULL] },
  AND: [notLeftYet(now)],
});

const DEFAULT_CANCEL_REASON = 'This bus company is no longer on Seatline';
const DELETE_TX = { maxWait: 10_000, timeout: 30_000 };

type CashToRepay = {
  code: string;
  seatLabel: string;
  passengerName: string | null;
  amountPesewas: number;
  soldBy: string | null;
};

const adminSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastActiveAt: true,
} as const;

/**
 * The platform itself: the bus companies on it and the stations they share.
 * The web app's /platform pages drive it.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messages: MessagesService,
    private readonly staffAuth: StaffAuthService,
    private readonly tokens: TokensService,
    private readonly trips: AdminTripsService,
  ) {}

  /** GET /platform/operators */
  async listOperators() {
    const operators = await this.prisma.operator.findMany({
      orderBy: { name: 'asc' },
      select: operatorSelect,
    });
    return operators.map(toOperator);
  }

  /** POST /platform/operators */
  async createOperator(ctx: PlatformContext, dto: CreateOperatorDto) {
    if (await this.prisma.operator.findUnique({ where: { slug: dto.slug } })) {
      throw invalidField('slug', 'Another operator already uses this slug');
    }
    return this.prisma.$transaction(async (tx) => {
      const operator = await tx.operator.create({
        data: {
          ...dto,
          name: dto.name.trim(),
          phone: phone(dto.phone),
          email: dto.email?.trim().toLowerCase(),
        },
        select: operatorSelect,
      });
      await this.audit.record(tx, {
        ...entry(ctx, 'operator.create', 'Operator', operator.id),
        operatorId: operator.id,
        after: dto,
      });
      return toOperator(operator);
    });
  }

  /** PATCH /platform/operators/:id: edit, or suspend and reinstate. */
  async updateOperator(
    ctx: PlatformContext,
    id: string,
    dto: UpdateOperatorDto,
  ) {
    const before = await this.prisma.operator.findUnique({
      where: { id },
      select: operatorSelect,
    });
    if (!before) throw notFound('Operator');
    const updated = await this.prisma.$transaction(async (tx) => {
      const operator = await tx.operator.update({
        where: { id },
        data: {
          ...dto,
          name: dto.name?.trim(),
          phone: phone(dto.phone),
          email: dto.email?.trim().toLowerCase(),
        },
        select: operatorSelect,
      });
      await this.audit.record(tx, {
        ...entry(ctx, 'operator.update', 'Operator', id),
        operatorId: id,
        before: {
          status: before.status,
          serviceFeePesewas: before.serviceFeePesewas,
          holdMinutes: before.holdMinutes,
        },
        after: dto,
      });
      return toOperator(operator);
    });
    if (
      dto.status === OperatorStatus.SUSPENDED &&
      before.status !== OperatorStatus.SUSPENDED
    ) {
      await this.signOutStaff(id);
    }
    return updated;
  }

  /**
   * GET /platform/operators/:id/impact: what suspending or deleting would
   * touch. Only an operator that never had a booking can be deleted.
   */
  async operatorImpact(id: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!operator) throw notFound('Operator');
    const upcoming = upcomingTrips(id, new Date());
    const [trips, tickets, bookings, staff] = await Promise.all([
      this.prisma.trip.count({ where: upcoming }),
      this.prisma.booking.count({
        where: { trip: upcoming, status: BookingStatus.CONFIRMED },
      }),
      this.prisma.booking.count({ where: { operatorId: id } }),
      this.prisma.staffUser.count({ where: { operatorId: id } }),
    ]);
    return {
      upcomingTrips: trips,
      ticketsOnUpcomingTrips: tickets,
      bookings,
      staff,
      deletable: bookings === 0,
    };
  }

  /**
   * POST /platform/operators/:id/suspend: suspends (search, sales and staff
   * sign-in all stop) and can cancel its upcoming trips the way its admin
   * would: online tickets refunded, cash walk-ins listed, everyone emailed.
   */
  async suspendOperator(
    ctx: PlatformContext,
    id: string,
    dto: SuspendOperatorDto,
  ) {
    let operator = await this.updateOperator(ctx, id, {
      status: OperatorStatus.SUSPENDED,
    });
    let tripsCancelled = 0;
    let refundsPending = 0;
    let passengersEmailed = 0;
    const cashToRepay: CashToRepay[] = [];
    if (dto.cancelTrips) {
      const trips = await this.prisma.trip.findMany({
        where: upcomingTrips(id, new Date()),
        select: { id: true },
      });
      const reason = dto.reason?.trim() || DEFAULT_CANCEL_REASON;
      const asOperator = { operatorId: id, staffId: ctx.staffId, ip: ctx.ip };
      for (const trip of trips) {
        try {
          const done = await this.trips.cancel(asOperator, trip.id, reason);
          tripsCancelled++;
          refundsPending += done.refundsPending;
          passengersEmailed += done.passengersEmailed;
          cashToRepay.push(...done.cashToRepay);
        } catch (e) {
          // Departed or cancelled in the meantime: nothing left to do for it
          if (!(e instanceof AppException && e.code === 'TRIP_LOCKED')) throw e;
        }
      }
      // Its bus and route counts are unchanged; refreshed for the status
      operator = (await this.listOperators()).find((o) => o.id === id)!;
    }
    return {
      operator,
      tripsCancelled,
      refundsPending,
      passengersEmailed,
      cashToRepay,
    };
  }

  /**
   * DELETE /platform/operators/:id: only for an operator that never had a
   * booking (added by mistake, or a test). Its fleet, routes, trips and staff
   * go with it; its audit history stays, unlinked. Anything that ever sold a
   * seat is kept for refunds and the books: suspend those instead.
   */
  async deleteOperator(ctx: PlatformContext, id: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!operator) throw notFound('Operator');

    await this.prisma.$transaction(async (tx) => {
      // Checked inside the transaction; the foreign keys back it up anyway
      if (await tx.booking.count({ where: { operatorId: id } })) {
        throw new AppException(
          'OPERATOR_HAS_SALES',
          `${operator.name} has sold seats, so its records must stay. Suspend it instead.`,
          HttpStatus.CONFLICT,
        );
      }
      const staff = (
        await tx.staffUser.findMany({
          where: { operatorId: id },
          select: { id: true },
        })
      ).map((s) => s.id);
      await tx.scanLog.deleteMany({
        where: {
          OR: [{ trip: { operatorId: id } }, { staffId: { in: staff } }],
        },
      });
      // Seats go with their trips; invite links and bay lists with the staff
      await tx.trip.deleteMany({ where: { operatorId: id } });
      await tx.refreshToken.deleteMany({
        where: { subjectType: SubjectType.STAFF, subjectId: { in: staff } },
      });
      await tx.staffUser.deleteMany({ where: { operatorId: id } });
      await tx.bay.deleteMany({ where: { operatorId: id } });
      await tx.bus.deleteMany({ where: { operatorId: id } });
      await tx.route.deleteMany({ where: { operatorId: id } });
      await tx.seatLayout.deleteMany({ where: { operatorId: id } });
      await tx.auditLog.updateMany({
        where: { operatorId: id },
        data: { operatorId: null },
      });
      await tx.operator.delete({ where: { id } });
      await this.audit.record(tx, {
        ...entry(ctx, 'operator.delete', 'Operator', id),
        before: { name: operator.name, slug: operator.slug },
      });
    }, DELETE_TX);
    return { deleted: true as const };
  }

  /** Ends every session of the operator's staff; RolesGuard stops the rest. */
  private async signOutStaff(operatorId: string) {
    const staff = await this.prisma.staffUser.findMany({
      where: { operatorId },
      select: { id: true },
    });
    for (const { id } of staff) {
      await this.tokens.revokeAll(SubjectType.STAFF, id);
    }
  }

  /** POST /platform/operators/:id/admins: invites an OPERATOR_ADMIN by email. */
  async inviteOperatorAdmin(
    ctx: PlatformContext,
    operatorId: string,
    dto: InviteOperatorAdminDto,
  ) {
    const operator = await this.prisma.operator.findUnique({
      where: { id: operatorId },
      select: { id: true, name: true },
    });
    if (!operator) throw notFound('Operator');
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.staffUser.findUnique({ where: { email } })) {
      throw new AppException(
        'EMAIL_EXISTS',
        'Someone already uses this email on Seatline',
        HttpStatus.CONFLICT,
      );
    }

    const { admin, token, messageId } = await this.prisma.$transaction(
      async (tx) => {
        const admin = await tx.staffUser.create({
          data: {
            operatorId,
            role: StaffRole.OPERATOR_ADMIN,
            status: StaffStatus.INVITED,
            name: dto.name.trim(),
            email,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
          },
        });
        const token = await this.staffAuth.issueToken(
          admin.id,
          TokenType.INVITE,
          tx,
        );
        const messageId = await this.messages.queueStaffInvite(tx, email, {
          name: admin.name,
          operatorName: operator.name,
          token,
          role: 'admin',
        });
        await this.audit.record(tx, {
          ...entry(ctx, 'operator.invite-admin', 'StaffUser', admin.id),
          operatorId,
          after: { email },
        });
        return { admin, token, messageId };
      },
    );
    await this.messages.send([messageId]);
    return {
      ...admin,
      operator,
      ...(SHOW_LINKS && {
        inviteUrl: this.messages.staffLink('accept', token),
      }),
    };
  }

  /** GET /platform/operators/:id/admins */
  async listOperatorAdmins(operatorId: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { id: operatorId },
      select: { id: true },
    });
    if (!operator) throw notFound('Operator');
    return this.prisma.staffUser.findMany({
      where: { operatorId, role: StaffRole.OPERATOR_ADMIN },
      orderBy: { name: 'asc' },
      select: adminSelect,
    });
  }

  /**
   * POST /platform/admins/:id/send-link: an operator admin has no one above
   * them in their company, so the platform recovers their account. Invited:
   * a fresh invite replaces the old one. Active: a 1-hour reset link.
   */
  async sendAdminLink(ctx: PlatformContext, id: string) {
    const admin = await this.prisma.staffUser.findFirst({
      where: { id, role: StaffRole.OPERATOR_ADMIN },
      select: {
        ...adminSelect,
        operatorId: true,
        operator: { select: { name: true } },
      },
    });
    if (!admin) throw notFound('Admin');
    if (admin.status === StaffStatus.DISABLED) {
      throw new AppException(
        'INVALID_STATE',
        'This admin is disabled',
        HttpStatus.CONFLICT,
      );
    }
    const invite = admin.status === StaffStatus.INVITED;

    const { token, messageId } = await this.prisma.$transaction(async (tx) => {
      if (invite) {
        await tx.staffToken.deleteMany({
          where: { staffUserId: id, type: TokenType.INVITE, usedAt: null },
        });
      }
      const token = await this.staffAuth.issueToken(
        id,
        invite ? TokenType.INVITE : TokenType.PASSWORD_RESET,
        tx,
      );
      const messageId = invite
        ? await this.messages.queueStaffInvite(tx, admin.email, {
            name: admin.name,
            operatorName: admin.operator!.name,
            token,
            role: 'admin',
          })
        : await this.messages.queueStaffReset(tx, admin.email, {
            name: admin.name,
            token,
          });
      await this.audit.record(tx, {
        ...entry(
          ctx,
          invite ? 'admin.resend-invite' : 'admin.reset-password',
          'StaffUser',
          id,
        ),
        operatorId: admin.operatorId,
      });
      return { token, messageId };
    });
    await this.messages.send([messageId]);
    return {
      sent: invite ? ('INVITE' as const) : ('PASSWORD_RESET' as const),
      ...(SHOW_LINKS && {
        url: this.messages.staffLink(invite ? 'accept' : 'reset', token),
      }),
    };
  }

  /** GET /platform/stations: every station, inactive ones included. */
  listStations() {
    return this.prisma.station.findMany({
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, city: true, region: true, active: true },
    });
  }

  /** POST /platform/stations */
  async createStation(ctx: PlatformContext, dto: CreateStationDto) {
    const data = trimmed(dto);
    await this.ensureStationFree(data.city, data.name);
    return this.prisma.$transaction(async (tx) => {
      const station = await tx.station.create({ data });
      await this.audit.record(tx, {
        ...entry(ctx, 'station.create', 'Station', station.id),
        after: data,
      });
      return station;
    });
  }

  /** PATCH /platform/stations/:id: edit, or take it off the pickers. */
  async updateStation(ctx: PlatformContext, id: string, dto: UpdateStationDto) {
    const before = await this.prisma.station.findUnique({ where: { id } });
    if (!before) throw notFound('Station');
    const data = trimmed(dto);
    const city = data.city ?? before.city;
    const name = data.name ?? before.name;
    if (city !== before.city || name !== before.name) {
      await this.ensureStationFree(city, name);
    }
    return this.prisma.$transaction(async (tx) => {
      const station = await tx.station.update({ where: { id }, data });
      await this.audit.record(tx, {
        ...entry(ctx, 'station.update', 'Station', id),
        before: {
          name: before.name,
          city: before.city,
          region: before.region,
          active: before.active,
        },
        after: data,
      });
      return station;
    });
  }

  private async ensureStationFree(city: string, name: string) {
    const taken = await this.prisma.station.findUnique({
      where: { city_name: { city, name } },
      select: { id: true },
    });
    if (taken) {
      throw invalidField(
        'name',
        `${city} already has a station called ${name}`,
      );
    }
  }
}

export function entry(
  ctx: PlatformContext,
  action: string,
  entityType: string,
  entityId: string,
) {
  return {
    operatorId: null,
    actorType: 'STAFF' as const,
    actorId: ctx.staffId,
    action,
    entityType,
    entityId,
    ip: ctx.ip,
  };
}

/** A public contact number, normalised when it's a Ghana number. */
function phone(value: string | undefined) {
  if (value === undefined) return undefined;
  return normalizeGhanaPhone(value) ?? value.trim();
}

function trimmed<T extends { name?: string; city?: string; region?: string }>(
  dto: T,
): T {
  return {
    ...dto,
    name: dto.name?.trim(),
    city: dto.city?.trim(),
    region: dto.region?.trim(),
  };
}

function toOperator<
  T extends { _count: { buses: number; routes: number; staff: number } },
>({ _count, ...operator }: T) {
  return { ...operator, counts: _count };
}
