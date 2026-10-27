import { HttpStatus, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { AppException } from '../common/errors/app.exception.js';
import { normalizeGhanaPhone } from '../common/phone.js';
import { requireSecret } from '../common/secrets.js';
import { SubjectType } from '../generated/prisma/enums.js';
import { MessagesService } from '../messages/messages.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { generateOtp, hashOtp, sameHash } from './secrets-hashing.js';
import { TokensService } from './tokens.service.js';

const MINUTE_MS = 60_000;
const OTP_VALID_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
/** The "Resend in 0:45" timer on the sign-in screen. */
const RESEND_AFTER_SECONDS = 45;
const LIMITS = {
  perEmail: { max: 3, windowMs: 15 * MINUTE_MS },
  perIp: { max: 10, windowMs: 60 * MINUTE_MS },
};

const passengerSelect = {
  id: true,
  email: true,
  phone: true,
  name: true,
} as const;

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/** Passenger sign-in by a 6-digit code sent by email. */
@Injectable()
export class AuthService {
  private readonly otpPepper = requireSecret('OTP_PEPPER');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly messages: MessagesService,
  ) {}

  /** POST /auth/otp/request */
  async requestOtp(rawEmail: string, client: ClientInfo) {
    const email = this.checkEmail(rawEmail);
    const now = Date.now();

    await this.enforceLimit(
      { email },
      LIMITS.perEmail,
      now,
      'Too many codes for this email. Try again shortly.',
    );
    if (client.ip) {
      await this.enforceLimit(
        { ip: client.ip },
        LIMITS.perIp,
        now,
        'Too many sign-in attempts. Try again later.',
      );
    }

    const code = generateOtp();
    const messageId = await this.prisma.$transaction(async (tx) => {
      await tx.otpCode.create({
        data: {
          email,
          codeHash: hashOtp(code, email, this.otpPepper),
          expiresAt: new Date(now + OTP_VALID_MINUTES * MINUTE_MS),
          ip: client.ip,
        },
      });
      return this.messages.queueOtp(tx, email, code, OTP_VALID_MINUTES);
    });
    await this.messages.send([messageId]);

    return {
      expiresInSeconds: OTP_VALID_MINUTES * 60,
      resendAfterSeconds: RESEND_AFTER_SECONDS,
    };
  }

  /** POST /auth/otp/verify: signs the passenger in. */
  async verifyOtp(rawEmail: string, code: string, client: ClientInfo) {
    const email = this.checkEmail(rawEmail);
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        email,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: OTP_MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw otpExpired();

    if (!sameHash(hashOtp(code, email, this.otpPepper), otp.codeHash)) {
      const { attempts } = await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
      throw new AppException(
        'OTP_INVALID',
        attemptsLeft
          ? 'That code is not right'
          : 'That code is not right. Ask for a new one.',
        HttpStatus.UNAUTHORIZED,
        { attemptsLeft },
      );
    }

    // Conditional, so the same code can't sign in twice
    const { count } = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (!count) throw otpExpired();

    const passenger = await this.prisma.$transaction(async (tx) => {
      const passenger = await tx.passenger.upsert({
        where: { email },
        create: { email, lastLoginAt: new Date() },
        update: { lastLoginAt: new Date() },
        select: passengerSelect,
      });
      // Tickets bought as a guest with this email now show in My tickets
      await tx.booking.updateMany({
        where: { contactEmail: email, passengerId: null },
        data: { passengerId: passenger.id },
      });
      return passenger;
    });

    const session = await this.tokens.startSession(
      SubjectType.PASSENGER,
      passenger.id,
      client,
    );
    return { session, passenger };
  }

  /** GET /me */
  me(passengerId: string) {
    return this.prisma.passenger.findUniqueOrThrow({
      where: { id: passengerId },
      select: passengerSelect,
    });
  }

  /** PATCH /me: the name on tickets, and the number that pre-fills MoMo. */
  updateMe(passengerId: string, dto: UpdateMeDto) {
    let phone: string | null | undefined;
    if (dto.phone !== undefined) {
      phone = dto.phone === '' ? null : normalizeGhanaPhone(dto.phone);
      if (phone === null && dto.phone !== '') {
        throw new AppException(
          'INVALID_PHONE',
          'Enter a Ghana number like 024 000 0000',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    return this.prisma.passenger.update({
      where: { id: passengerId },
      data: { name: dto.name?.trim() || undefined, phone },
      select: passengerSelect,
    });
  }

  private checkEmail(raw: string): string {
    const email = raw.trim().toLowerCase();
    if (!isEmail(email) || email.length > 254) {
      throw new AppException(
        'INVALID_EMAIL',
        'Enter a valid email address',
        HttpStatus.BAD_REQUEST,
      );
    }
    return email;
  }

  private async enforceLimit(
    where: { email: string } | { ip: string },
    limit: { max: number; windowMs: number },
    now: number,
    message: string,
  ) {
    const recent = await this.prisma.otpCode.findMany({
      where: { ...where, createdAt: { gt: new Date(now - limit.windowMs) } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (recent.length < limit.max) return;
    // Free again when the oldest code in the window ages out
    const retryAfterSeconds = Math.ceil(
      (recent[0].createdAt.getTime() + limit.windowMs - now) / 1000,
    );
    throw new AppException(
      'OTP_RATE_LIMITED',
      message,
      HttpStatus.TOO_MANY_REQUESTS,
      { retryAfterSeconds },
    );
  }
}

function otpExpired() {
  return new AppException(
    'OTP_EXPIRED',
    'This code has expired or was already used. Ask for a new one.',
    HttpStatus.UNAUTHORIZED,
  );
}
