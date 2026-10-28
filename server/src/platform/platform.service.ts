import { HttpStatus, Injectable } from '@nestjs/common';
import { invalidField, notFound } from '../admin/admin-context.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { normalizeGhanaPhone } from '../common/phone.js';
import {
  StaffRole,
  StaffStatus,
  TokenType,
} from '../generated/prisma/enums.js';
import { MessagesService } from '../messages/messages.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffAuthService } from '../staff-auth/staff-auth.service.js';
import {
  CreateOperatorDto,
  CreateStationDto,
  InviteOperatorAdminDto,
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

/**
 * The platform itself: the bus companies on it and the stations they share.
 * There are no screens for this yet; use Swagger or an API client.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messages: MessagesService,
    private readonly staffAuth: StaffAuthService,
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
    return this.prisma.$transaction(async (tx) => {
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

function entry(
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

function toOperator({
  _count,
  ...operator
}: {
  _count: { buses: number; routes: number; staff: number };
  [key: string]: unknown;
}) {
  return { ...operator, counts: _count };
}
