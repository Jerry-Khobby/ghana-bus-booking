import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  StaffRole,
  StaffStatus,
  SubjectType,
  TokenType,
} from '../generated/prisma/enums.js';
import { MessagesService } from '../messages/messages.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffAuthService } from '../staff-auth/staff-auth.service.js';
import {
  auditEntry,
  invalidField,
  notFound,
  type AdminContext,
} from './admin-context.js';
import {
  InviteAgentDto,
  SettleCashDto,
  UpdateAgentDto,
} from './dto/agent.dto.js';

const agentSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastActiveAt: true,
  station: { select: { id: true, name: true, city: true } },
  bays: {
    select: { bay: { select: { id: true, number: true } } },
    orderBy: { bay: { number: 'asc' } },
  },
} satisfies Prisma.StaffUserSelect;
type AgentRow = Prisma.StaffUserGetPayload<{ select: typeof agentSelect }>;

// The plan allows showing the link once in the response for testing; never
// in production, where only the email carries it
const SHOW_LINKS = process.env.NODE_ENV !== 'production';

/** Agents and the cash they take. */
@Injectable()
export class AdminStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messages: MessagesService,
    private readonly staffAuth: StaffAuthService,
    private readonly tokens: TokensService,
  ) {}

  /** GET /admin/agents */
  async listAgents(ctx: AdminContext) {
    const agents = await this.prisma.staffUser.findMany({
      where: { operatorId: ctx.operatorId, role: StaffRole.AGENT },
      orderBy: { name: 'asc' },
      select: agentSelect,
    });
    return agents.map(toAgent);
  }

  /** POST /admin/agents: creates the agent and emails the invite. */
  async inviteAgent(ctx: AdminContext, dto: InviteAgentDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.staffUser.findUnique({ where: { email } })) {
      throw new AppException(
        'EMAIL_EXISTS',
        'Someone already uses this email on Seatline',
        HttpStatus.CONFLICT,
      );
    }
    await this.checkStationAndBays(ctx, dto.stationId, dto.bayIds);
    const operator = await this.prisma.operator.findUniqueOrThrow({
      where: { id: ctx.operatorId },
      select: { name: true },
    });

    const { agent, token, messageId } = await this.prisma.$transaction(
      async (tx) => {
        const agent = await tx.staffUser.create({
          data: {
            operatorId: ctx.operatorId,
            role: StaffRole.AGENT,
            status: StaffStatus.INVITED,
            name: dto.name.trim(),
            email,
            stationId: dto.stationId,
            bays: { create: dto.bayIds.map((bayId) => ({ bayId })) },
          },
          select: agentSelect,
        });
        const token = await this.staffAuth.issueToken(
          agent.id,
          TokenType.INVITE,
          tx,
        );
        const messageId = await this.messages.queueStaffInvite(tx, email, {
          name: agent.name,
          operatorName: operator.name,
          token,
        });
        await this.audit.record(
          tx,
          auditEntry(ctx, 'agent.invite', 'StaffUser', agent.id, null, {
            email,
            stationId: dto.stationId,
            bayIds: dto.bayIds,
          }),
        );
        return { agent, token, messageId };
      },
    );
    await this.messages.send([messageId]);

    return {
      ...toAgent(agent),
      ...(SHOW_LINKS && {
        inviteUrl: this.messages.staffLink('accept', token),
      }),
    };
  }

  /** PATCH /admin/agents/:id: station, bays, or disable / re-enable. */
  async updateAgent(ctx: AdminContext, id: string, dto: UpdateAgentDto) {
    const agent = await this.findAgent(ctx, id);
    const stationId = dto.stationId ?? agent.stationId;
    if (!stationId) throw invalidField('stationId', 'Pick a station');
    const bayIds =
      dto.bayIds ??
      // Moving station drops bays that aren't there
      (dto.stationId ? [] : undefined);
    if (dto.stationId || dto.bayIds) {
      await this.checkStationAndBays(ctx, stationId, bayIds ?? []);
    }
    if (dto.status === 'ACTIVE' && !agent.passwordHash) {
      throw new AppException(
        'INVALID_STATE',
        "This agent hasn't accepted their invite yet",
        HttpStatus.CONFLICT,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (bayIds) {
        await tx.agentBay.deleteMany({ where: { staffUserId: id } });
        await tx.agentBay.createMany({
          data: bayIds.map((bayId) => ({ staffUserId: id, bayId })),
        });
      }
      const updated = await tx.staffUser.update({
        where: { id },
        data: {
          stationId,
          status:
            dto.status === 'DISABLED'
              ? StaffStatus.DISABLED
              : dto.status === 'ACTIVE'
                ? StaffStatus.ACTIVE
                : undefined,
        },
        select: agentSelect,
      });
      await this.audit.record(
        tx,
        auditEntry(
          ctx,
          'agent.update',
          'StaffUser',
          id,
          { stationId: agent.stationId, status: agent.status },
          { ...dto },
        ),
      );
      return updated;
    });
    // A disabled agent is signed out everywhere at once
    if (dto.status === 'DISABLED') {
      await this.tokens.revokeAll(SubjectType.STAFF, id);
    }
    return toAgent(updated);
  }

  /** POST /admin/agents/:id/reset-password: emails a 1-hour link. */
  async resetPassword(ctx: AdminContext, id: string) {
    const agent = await this.findAgent(ctx, id);
    if (agent.status !== StaffStatus.ACTIVE) {
      throw new AppException(
        'INVALID_STATE',
        agent.status === StaffStatus.INVITED
          ? "This agent hasn't accepted their invite yet; resend it instead"
          : 'Re-enable this agent first',
        HttpStatus.CONFLICT,
      );
    }
    const { token, messageId } = await this.prisma.$transaction(async (tx) => {
      const token = await this.staffAuth.issueToken(
        id,
        TokenType.PASSWORD_RESET,
        tx,
      );
      const messageId = await this.messages.queueStaffReset(tx, agent.email, {
        name: agent.name,
        token,
      });
      await this.audit.record(
        tx,
        auditEntry(ctx, 'agent.reset-password', 'StaffUser', id),
      );
      return { token, messageId };
    });
    await this.messages.send([messageId]);
    return {
      sent: true,
      ...(SHOW_LINKS && { resetUrl: this.messages.staffLink('reset', token) }),
    };
  }

  /** POST /admin/agents/:id/resend-invite: a new link replaces the old one. */
  async resendInvite(ctx: AdminContext, id: string) {
    const agent = await this.findAgent(ctx, id);
    if (agent.status !== StaffStatus.INVITED) {
      throw new AppException(
        'INVALID_STATE',
        'This agent has already accepted their invite',
        HttpStatus.CONFLICT,
      );
    }
    const operator = await this.prisma.operator.findUniqueOrThrow({
      where: { id: ctx.operatorId },
      select: { name: true },
    });
    const { token, messageId } = await this.prisma.$transaction(async (tx) => {
      await tx.staffToken.deleteMany({
        where: { staffUserId: id, type: TokenType.INVITE, usedAt: null },
      });
      const token = await this.staffAuth.issueToken(id, TokenType.INVITE, tx);
      const messageId = await this.messages.queueStaffInvite(tx, agent.email, {
        name: agent.name,
        operatorName: operator.name,
        token,
      });
      await this.audit.record(
        tx,
        auditEntry(ctx, 'agent.resend-invite', 'StaffUser', id),
      );
      return { token, messageId };
    });
    await this.messages.send([messageId]);
    return {
      sent: true,
      ...(SHOW_LINKS && {
        inviteUrl: this.messages.staffLink('accept', token),
      }),
    };
  }

  /** GET /admin/cash?status=unsettled: cash each agent still holds. */
  async unsettledCash(ctx: AdminContext) {
    const groups = await this.prisma.cashEntry.groupBy({
      by: ['agentId'],
      where: { operatorId: ctx.operatorId, settledAt: null },
      _count: { _all: true },
      _sum: { amountPesewas: true },
      _min: { createdAt: true },
    });
    const agents = await this.prisma.staffUser.findMany({
      where: { id: { in: groups.map((g) => g.agentId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(agents.map((a) => [a.id, a]));
    return groups
      .map((g) => ({
        agent: byId.get(g.agentId)!,
        tickets: g._count._all,
        amountPesewas: g._sum.amountPesewas ?? 0,
        currency: 'GHS' as const,
        oldest: g._min.createdAt,
      }))
      .sort((a, b) => b.amountPesewas - a.amountPesewas);
  }

  /** POST /admin/cash/settle: the admin collected an agent's cash. */
  async settleCash(ctx: AdminContext, dto: SettleCashDto) {
    const agent = await this.prisma.staffUser.findFirst({
      where: { id: dto.agentId, operatorId: ctx.operatorId },
      select: { id: true },
    });
    if (!agent) throw notFound('Agent');
    const where = {
      operatorId: ctx.operatorId,
      agentId: dto.agentId,
      settledAt: null,
      createdAt: { lte: new Date(dto.upTo) },
    };

    return this.prisma.$transaction(async (tx) => {
      const { _sum } = await tx.cashEntry.aggregate({
        where,
        _sum: { amountPesewas: true },
      });
      const { count } = await tx.cashEntry.updateMany({
        where,
        data: { settledAt: new Date(), settledById: ctx.staffId },
      });
      const amountPesewas = _sum.amountPesewas ?? 0;
      await this.audit.record(
        tx,
        auditEntry(ctx, 'cash.settle', 'StaffUser', dto.agentId, null, {
          upTo: dto.upTo,
          entries: count,
          amountPesewas,
        }),
      );
      return { settled: count, amountPesewas, currency: 'GHS' as const };
    });
  }

  private async findAgent(ctx: AdminContext, id: string) {
    const agent = await this.prisma.staffUser.findFirst({
      where: { id, operatorId: ctx.operatorId, role: StaffRole.AGENT },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        stationId: true,
        passwordHash: true,
      },
    });
    if (!agent) throw notFound('Agent');
    return agent;
  }

  /** The station must exist, and every bay be the operator's and there. */
  private async checkStationAndBays(
    ctx: AdminContext,
    stationId: string,
    bayIds: string[],
  ) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, active: true },
      select: { id: true },
    });
    if (!station) throw invalidField('stationId', 'Pick an active station');
    const ok = await this.prisma.bay.count({
      where: { id: { in: bayIds }, operatorId: ctx.operatorId, stationId },
    });
    if (ok !== new Set(bayIds).size) {
      throw invalidField('bayIds', 'Pick your bays at that station');
    }
  }
}

function toAgent({ bays, ...agent }: AgentRow) {
  return { ...agent, bays: bays.map((b) => b.bay) };
}
