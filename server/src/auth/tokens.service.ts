import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/auth/auth-user.js';
import { AppException } from '../common/errors/app.exception.js';
import { requireSecret } from '../common/secrets.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  OperatorStatus,
  StaffStatus,
  SubjectType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateRefreshToken, hashRefreshToken } from './secrets-hashing.js';

const HOUR_MS = 60 * 60 * 1000;
/**
 * A rotated token used again this soon is a race, not theft: the browser may
 * not have stored the new cookie yet. Replays after this end the sign-in.
 */
export const REUSE_GRACE_MS = 30_000;
/** Passengers stay signed in a month; agents sign in once per shift. */
export const REFRESH_LIFETIME_MS: Record<SubjectType, number> = {
  PASSENGER: 30 * 24 * HOUR_MS,
  STAFF: 12 * HOUR_MS,
};

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

/**
 * Access tokens (15-minute JWTs) and rotating refresh tokens, for passengers
 * and staff alike. Each refresh replaces the token and revokes the old one; a
 * revoked token used again, after REUSE_GRACE_MS, means it was stolen, so its
 * whole family is revoked.
 */
@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private readonly pepper = requireSecret('REFRESH_TOKEN_PEPPER');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** A fresh session after signing in: new access token and token family. */
  async startSession(
    subjectType: SubjectType,
    subjectId: string,
    client: ClientInfo,
  ): Promise<Session> {
    const accessToken = await this.accessTokenFor(subjectType, subjectId);
    return {
      accessToken,
      ...(await this.storeRefresh(
        subjectType,
        subjectId,
        randomUUID(),
        client,
      )),
    };
  }

  /** POST /auth/refresh: swaps a refresh token for a new pair. */
  async refresh(refreshToken: string | undefined, client: ClientInfo) {
    if (!refreshToken) throw refreshInvalid();
    const now = new Date();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken, this.pepper) },
    });
    // Signing out, a detected theft and a disabled account expire the whole
    // family, so an unexpired token can only have been rotated
    if (!stored || stored.expiresAt <= now) throw refreshInvalid();

    if (stored.revokedAt) {
      // Rotated seconds ago: two tabs restoring at once, or a page left
      // before the new cookie arrived. A new token in the same sign-in.
      if (now.getTime() - stored.revokedAt.getTime() <= REUSE_GRACE_MS) {
        return this.rotate(stored, client);
      }
      // Someone is replaying an old token: end every session in this family
      this.logger.warn(
        `Refresh token reused for ${stored.subjectType} ${stored.subjectId}; revoking its family`,
      );
      await this.revokeFamily(stored.familyId);
      throw new AppException(
        'REFRESH_REUSED',
        'Please sign in again',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Conditional. If another request got here first it either rotated the
    // token (the same race as above) or signed out, which expired it.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (!count) {
      const again = await this.prisma.refreshToken.findUnique({
        where: { id: stored.id },
        select: { expiresAt: true },
      });
      if (!again || again.expiresAt <= now) throw refreshInvalid();
    }
    return this.rotate(stored, client);
  }

  /** A fresh access token and the next refresh token in this sign-in. */
  private async rotate(
    stored: { subjectType: SubjectType; subjectId: string; familyId: string },
    client: ClientInfo,
  ) {
    const accessToken = await this.accessTokenFor(
      stored.subjectType,
      stored.subjectId,
    );
    return {
      accessToken,
      ...(await this.storeRefresh(
        stored.subjectType,
        stored.subjectId,
        stored.familyId,
        client,
      )),
    };
  }

  /** POST /auth/logout: ends this sign-in on every tab that shares it. */
  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken, this.pepper) },
      select: { familyId: true },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  /** Ends every session for one person (e.g. a disabled agent). */
  async revokeAll(subjectType: SubjectType, subjectId: string) {
    await this.end({ subjectType, subjectId });
  }

  private revokeFamily(familyId: string) {
    return this.end({ familyId });
  }

  /**
   * Revokes and expires every token matched, already-rotated ones too, so
   * none of them gets the rotation grace.
   */
  private async end(where: Prisma.RefreshTokenWhereInput) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { ...where, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { ...where, expiresAt: { gt: now } },
        data: { expiresAt: now },
      }),
    ]);
  }

  private async storeRefresh(
    subjectType: SubjectType,
    subjectId: string,
    familyId: string,
    client: ClientInfo,
  ) {
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + REFRESH_LIFETIME_MS[subjectType],
    );
    await this.prisma.refreshToken.create({
      data: {
        subjectType,
        subjectId,
        familyId,
        tokenHash: hashRefreshToken(refreshToken, this.pepper),
        expiresAt: refreshExpiresAt,
        userAgent: client.userAgent?.slice(0, 300),
        ip: client.ip,
      },
    });
    return { refreshToken, refreshExpiresAt };
  }

  /** Claims are read fresh, so a role change or disabled account takes effect. */
  private async accessTokenFor(
    subjectType: SubjectType,
    subjectId: string,
  ): Promise<string> {
    let claims: AuthUser;
    if (subjectType === SubjectType.PASSENGER) {
      const passenger = await this.prisma.passenger.findUnique({
        where: { id: subjectId },
        select: { id: true },
      });
      if (!passenger) throw refreshInvalid();
      claims = { typ: 'passenger', sub: passenger.id };
    } else {
      const staff = await this.prisma.staffUser.findUnique({
        where: { id: subjectId },
        select: {
          id: true,
          role: true,
          status: true,
          operatorId: true,
          stationId: true,
          operator: { select: { status: true } },
        },
      });
      // A suspended operator's staff can't stay signed in
      if (
        !staff ||
        staff.status !== StaffStatus.ACTIVE ||
        (staff.operator && staff.operator.status !== OperatorStatus.ACTIVE)
      ) {
        throw refreshInvalid();
      }
      claims = {
        typ: 'staff',
        sub: staff.id,
        role: staff.role,
        op: staff.operatorId,
        stn: staff.stationId,
      };
    }
    return this.jwt.signAsync({ ...claims });
  }
}

function refreshInvalid() {
  return new AppException(
    'REFRESH_INVALID',
    'Please sign in again',
    HttpStatus.UNAUTHORIZED,
  );
}
