import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AppException } from '../errors/app.exception.js';

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Idempotency-Key support for requests that charge money: the same key with
 * the same body within 24 hours gets the first response back instead of a
 * second charge.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  hashRequest(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }

  /** The stored response for this key, or null if it's new or expired. */
  async replay(key: string, scope: string, requestHash: string) {
    const stored = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (!stored || stored.expiresAt < new Date()) return null;
    if (stored.scope !== scope || stored.requestHash !== requestHash) {
      throw new AppException(
        'INVALID_STATE',
        'This Idempotency-Key was already used for a different request',
        HttpStatus.CONFLICT,
      );
    }
    return stored.responseBody;
  }

  async remember(
    key: string,
    scope: string,
    requestHash: string,
    statusCode: number,
    responseBody: unknown,
  ) {
    // Two identical requests racing: the first one stored wins
    await this.prisma.idempotencyKey.createMany({
      data: {
        key,
        scope,
        requestHash,
        statusCode,
        responseBody: responseBody as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
      skipDuplicates: true,
    });
  }
}
