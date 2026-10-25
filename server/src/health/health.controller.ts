import { Controller, Get, HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness: the process is up. Never touches the database, so Render's
  // pings don't keep Neon awake.
  @Get()
  live() {
    return { status: 'ok' };
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
