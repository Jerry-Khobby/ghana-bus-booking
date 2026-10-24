import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
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
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'down',
      });
    }
    return { status: 'ok', database: 'up' };
  }
}
