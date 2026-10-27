import { HttpStatus, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { TokensService } from '../auth/tokens.service.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  StaffRole,
  StaffStatus,
  SubjectType,
  TokenType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkPassword } from './password-policy.js';

const MINUTE_MS = 60_000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * MINUTE_MS;
/** How long invite and reset links work. */
export const TOKEN_LIFETIME_MS: Record<TokenType, number> = {
  INVITE: 7 * 24 * 60 * MINUTE_MS,
  PASSWORD_RESET: 60 * MINUTE_MS,
};

/** Which console the sign-in toggle asked for. */
export type SignInAs = 'AGENT' | 'OPERATOR';

/** Where the frontend sends each kind of staff after signing in. */
const HOME: Record<StaffRole, string> = {
  AGENT: '/agent',
  OPERATOR_ADMIN: '/operator',
  PLATFORM_ADMIN: '/platform',
};

const staffSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  operator: { select: { id: true, name: true } },
  station: { select: { id: true, name: true, city: true } },
  bays: {
    select: { bay: { select: { id: true, number: true } } },
    orderBy: { bay: { number: 'asc' } },
  },
} satisfies Prisma.StaffUserSelect;

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/** Staff sign-in with email and password, invites and password resets. */
@Injectable()
export class StaffAuthService {
  // Checked against when the email is unknown, so a miss takes as long as a
  // wrong password and timing doesn't reveal which emails exist
  private readonly dummyHash = hash(randomBytes(16).toString('hex'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  /** POST /staff/auth/login */
  async login(
    rawEmail: string,
    password: string,
    as: SignInAs,
    client: ClientInfo,
  ) {
    const email = rawEmail.trim().toLowerCase();
    const staff = await this.prisma.staffUser.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        status: true,
        passwordHash: true,
        failedLogins: true,
        lockedUntil: true,
      },
    });
    const now = new Date();

    if (staff?.lockedUntil && staff.lockedUntil > now) {
      throw new AppException(
        'ACCOUNT_LOCKED',
        'Too many failed sign-ins. Try again later.',
        HttpStatus.LOCKED,
        {
          retryAfterSeconds: Math.ceil(
            (staff.lockedUntil.getTime() - now.getTime()) / 1000,
          ),
        },
      );
    }

    const usable = staff?.status === StaffStatus.ACTIVE && !!staff.passwordHash;
    const passwordOk = await verify(
      usable ? staff.passwordHash! : await this.dummyHash,
      password,
    ).catch(() => false);

    if (!usable || !passwordOk) {
      if (usable) {
        const failedLogins = staff.failedLogins + 1;
        const lock = failedLogins >= MAX_FAILED_LOGINS;
        await this.prisma.staffUser.update({
          where: { id: staff.id },
          data: {
            failedLogins: lock ? 0 : failedLogins,
            lockedUntil: lock ? new Date(now.getTime() + LOCK_MS) : undefined,
          },
        });
      }
      throw invalidCredentials();
    }

    // The toggle on the sign-in screen: agents can't open the admin side
    if (as === 'OPERATOR' && staff.role === StaffRole.AGENT) {
      throw new AppException(
        'ROLE_NOT_ALLOWED',
        'Agents sign in to the agent console',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { failedLogins: 0, lockedUntil: null, lastActiveAt: now },
    });
    return this.signIn(staff.id, as, client);
  }

  /** POST /staff/auth/accept-invite: sets the first password and signs in. */
  acceptInvite(rawToken: string, password: string, client: ClientInfo) {
    return this.setPasswordWithToken(
      rawToken,
      password,
      TokenType.INVITE,
      client,
    );
  }

  /** POST /staff/auth/reset-password: also signs out every other session. */
  resetPassword(rawToken: string, password: string, client: ClientInfo) {
    return this.setPasswordWithToken(
      rawToken,
      password,
      TokenType.PASSWORD_RESET,
      client,
    );
  }

  /** GET /staff/me. Records activity at most once a minute. */
  async me(staffId: string) {
    await this.prisma.staffUser.updateMany({
      where: {
        id: staffId,
        OR: [
          { lastActiveAt: null },
          { lastActiveAt: { lt: new Date(Date.now() - MINUTE_MS) } },
        ],
      },
      data: { lastActiveAt: new Date() },
    });
    return this.profile(staffId);
  }

  /**
   * A single-use invite or reset link for a staff member. Returns the raw
   * token for the email; only its hash is stored. Used by operator admin.
   */
  async issueToken(
    staffUserId: string,
    type: TokenType,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await db.staffToken.create({
      data: {
        staffUserId,
        type,
        tokenHash: hashStaffToken(token),
        expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS[type]),
      },
    });
    return token;
  }

  private async setPasswordWithToken(
    rawToken: string,
    password: string,
    type: TokenType,
    client: ClientInfo,
  ) {
    const now = new Date();
    const stored = await this.prisma.staffToken.findUnique({
      where: { tokenHash: hashStaffToken(rawToken) },
      select: {
        id: true,
        type: true,
        usedAt: true,
        expiresAt: true,
        staffUser: { select: { id: true, email: true, status: true } },
      },
    });
    if (
      !stored ||
      stored.type !== type ||
      stored.usedAt ||
      stored.expiresAt <= now ||
      stored.staffUser.status === StaffStatus.DISABLED
    ) {
      throw new AppException(
        'TOKEN_INVALID',
        'This link is wrong, used or expired. Ask your admin for a new one.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    checkPassword(password, stored.staffUser.email);
    const passwordHash = await hash(password);

    await this.prisma.$transaction(async (tx) => {
      // Conditional, so one link can't set the password twice
      const { count } = await tx.staffToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: now },
      });
      if (!count) {
        throw new AppException(
          'TOKEN_INVALID',
          'This link was already used',
          HttpStatus.UNAUTHORIZED,
        );
      }
      await tx.staffUser.update({
        where: { id: stored.staffUser.id },
        data: {
          passwordHash,
          status: StaffStatus.ACTIVE,
          failedLogins: 0,
          lockedUntil: null,
          lastActiveAt: now,
        },
      });
    });
    if (type === TokenType.PASSWORD_RESET) {
      await this.tokens.revokeAll(SubjectType.STAFF, stored.staffUser.id);
    }

    const { role } = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: stored.staffUser.id },
      select: { role: true },
    });
    return this.signIn(
      stored.staffUser.id,
      role === StaffRole.AGENT ? 'AGENT' : 'OPERATOR',
      client,
    );
  }

  private async signIn(staffId: string, as: SignInAs, client: ClientInfo) {
    const session = await this.tokens.startSession(
      SubjectType.STAFF,
      staffId,
      client,
    );
    const staff = await this.profile(staffId);
    return {
      session,
      staff,
      home: as === 'AGENT' ? HOME.AGENT : HOME[staff.role],
    };
  }

  private async profile(staffId: string) {
    const staff = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: staffId },
      select: staffSelect,
    });
    return { ...staff, bays: staff.bays.map((b) => b.bay) };
  }
}

export function hashStaffToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function invalidCredentials() {
  return new AppException(
    'INVALID_CREDENTIALS',
    'Email or password is wrong',
    HttpStatus.UNAUTHORIZED,
  );
}
