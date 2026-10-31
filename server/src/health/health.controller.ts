import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/auth/public.decorator.js';
import { NoLimit } from '../common/rate-limits.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Keeps the first half of each IP, enough to tell a visitor from a proxy. */
function mask(value: string): string {
  return value
    .replace(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.x.x')
    .replace(/\b([0-9a-f]{1,4}:[0-9a-f]{1,4}):[0-9a-f:]+/gi, '$1:x');
}

@Public()
@NoLimit()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger('IpCheck');

  constructor(private readonly prisma: PrismaService) {}

  // Liveness: the process is up. Never touches the database, so Render's
  // pings don't keep Neon awake.
  @Get()
  live(@Query('ipcheck') ipcheck: string | undefined, @Req() req: Request) {
    // TEMPORARY: which address rate limits see behind Vercel and Render.
    // Remove once TRUST_PROXY is settled.
    if (ipcheck === '1') this.logClientIp(req);
    return { status: 'ok' };
  }

  private logClientIp(req: Request) {
    const header = (name: string) => {
      const value = req.headers[name];
      return value === undefined ? '-' : mask(String(value));
    };
    this.logger.log(
      [
        `ipcheck req.ip=${mask(req.ip ?? '-')}`,
        `req.ips=[${req.ips.map(mask).join(', ')}]`,
        `socket=${mask(req.socket.remoteAddress ?? '-')}`,
        ...[
          'x-forwarded-for',
          'x-real-ip',
          'cf-connecting-ip',
          'true-client-ip',
          'x-vercel-forwarded-for',
          'x-vercel-proxied-for',
          'forwarded',
          'via',
        ].map((name) => `${name}=${header(name)}`),
      ].join(' | '),
    );
  }

  // Readiness: the database answers.
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException(
        'INTERNAL',
        'The database is not reachable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ok', database: 'up' };
  }
}
