import { HttpStatus, Injectable } from '@nestjs/common';
import { notFound } from '../admin/admin-context.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { normalizeGhanaPhone } from '../common/phone.js';
import {
  ApplicationStatus,
  StaffRole,
  StaffStatus,
} from '../generated/prisma/enums.js';
import { MessagesService } from '../messages/messages.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ApplyDto,
  ApproveApplicationDto,
  DeclineApplicationDto,
} from './dto/application.dto.js';
import {
  entry,
  PlatformService,
  type PlatformContext,
} from './platform.service.js';

const applicationSelect = {
  id: true,
  companyName: true,
  contactName: true,
  email: true,
  phone: true,
  city: true,
  fleetSize: true,
  message: true,
  status: true,
  declineReason: true,
  reviewedAt: true,
  createdAt: true,
  operator: { select: { id: true, name: true, slug: true } },
} as const;

/**
 * Bus companies asking to join: the public /join form files them, and a
 * platform admin approves (creating the operator and inviting the contact
 * as its admin) or declines.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messages: MessagesService,
    private readonly platform: PlatformService,
  ) {}

  /** POST /applications: always the same answer, so it can't probe emails. */
  async apply(dto: ApplyDto) {
    const received = { received: true as const };
    if (dto.website) return received;

    const phone = normalizeGhanaPhone(dto.phone);
    if (!phone) {
      throw new AppException(
        'INVALID_PHONE',
        'Enter a Ghana number like 024 000 0000',
        HttpStatus.BAD_REQUEST,
      );
    }
    const email = dto.email.trim().toLowerCase();
    // One waiting application per email: a resubmit isn't news
    const waiting = await this.prisma.operatorApplication.findFirst({
      where: { email, status: ApplicationStatus.PENDING },
      select: { id: true },
    });
    if (waiting) return received;

    const ids = await this.prisma.$transaction(async (tx) => {
      const application = await tx.operatorApplication.create({
        data: {
          companyName: dto.companyName.trim(),
          contactName: dto.contactName.trim(),
          email,
          phone,
          city: dto.city.trim(),
          fleetSize: dto.fleetSize,
          message: dto.message?.trim() || null,
        },
        select: { companyName: true, contactName: true, city: true },
      });
      const ids = [
        await this.messages.queueApplicationReceived(tx, email, application),
      ];
      const admins = await tx.staffUser.findMany({
        where: { role: StaffRole.PLATFORM_ADMIN, status: StaffStatus.ACTIVE },
        select: { email: true },
      });
      for (const admin of admins) {
        ids.push(
          await this.messages.queueApplicationAlert(tx, admin.email, {
            companyName: application.companyName,
            city: application.city,
          }),
        );
      }
      return ids;
    });
    await this.messages.send(ids);
    return received;
  }

  /** GET /platform/applications: newest first. */
  list(status: ApplicationStatus = ApplicationStatus.PENDING) {
    return this.prisma.operatorApplication.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      select: applicationSelect,
    });
  }

  /** POST /platform/applications/:id/approve: the company and its admin's invite. */
  async approve(ctx: PlatformContext, id: string, dto: ApproveApplicationDto) {
    const application = await this.claim(id, ApplicationStatus.APPROVED, ctx);
    try {
      if (
        await this.prisma.staffUser.findUnique({
          where: { email: application.email },
        })
      ) {
        throw new AppException(
          'EMAIL_EXISTS',
          `${application.email} already has a Seatline account. Invite another person from the company's page once it's added.`,
          HttpStatus.CONFLICT,
        );
      }
      const operator = await this.platform.createOperator(ctx, {
        name: application.companyName,
        slug: dto.slug,
        phone: application.phone,
        email: application.email,
      });
      const admin = await this.platform.inviteOperatorAdmin(ctx, operator.id, {
        name: application.contactName,
        email: application.email,
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.operatorApplication.update({
          where: { id },
          data: { operatorId: operator.id },
        });
        await this.audit.record(tx, {
          ...entry(ctx, 'application.approve', 'OperatorApplication', id),
          operatorId: operator.id,
        });
      });
      return { operator, admin };
    } catch (error) {
      // Nothing was made, or the company was but not its admin: either way
      // the application goes back to waiting, to approve again or decline
      await this.prisma.operatorApplication.update({
        where: { id },
        data: {
          status: ApplicationStatus.PENDING,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      throw error;
    }
  }

  /** POST /platform/applications/:id/decline, with an optional reason for them. */
  async decline(ctx: PlatformContext, id: string, dto: DeclineApplicationDto) {
    const reason = dto.reason?.trim() || null;
    const application = await this.claim(id, ApplicationStatus.DECLINED, ctx);
    const messageId = await this.prisma.$transaction(async (tx) => {
      await tx.operatorApplication.update({
        where: { id },
        data: { declineReason: reason },
      });
      await this.audit.record(tx, {
        ...entry(ctx, 'application.decline', 'OperatorApplication', id),
        after: { reason },
      });
      return this.messages.queueApplicationDeclined(tx, application.email, {
        contactName: application.contactName,
        companyName: application.companyName,
        reason,
      });
    });
    await this.messages.send([messageId]);
    return { declined: true };
  }

  /** Moves a waiting application on; conditional, so two admins can't both. */
  private async claim(
    id: string,
    status: ApplicationStatus,
    ctx: PlatformContext,
  ) {
    const { count } = await this.prisma.operatorApplication.updateMany({
      where: { id, status: ApplicationStatus.PENDING },
      data: { status, reviewedById: ctx.staffId, reviewedAt: new Date() },
    });
    const application = await this.prisma.operatorApplication.findUnique({
      where: { id },
      select: {
        companyName: true,
        contactName: true,
        email: true,
        phone: true,
        status: true,
      },
    });
    if (!application) throw notFound('Application');
    if (!count) {
      throw new AppException(
        'INVALID_STATE',
        `This application was already ${application.status.toLowerCase()}`,
        HttpStatus.CONFLICT,
      );
    }
    return application;
  }
}
