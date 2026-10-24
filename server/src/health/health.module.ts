import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// GET /health for the host, GET /health/ready for "can we reach the database".
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
