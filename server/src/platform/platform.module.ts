import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

// Platform admin: operators, their first admins, shared stations.
// Writes: Operator, Station, StaffUser
// Routes: /platform/*
@Module({
  controllers: [PlatformController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
