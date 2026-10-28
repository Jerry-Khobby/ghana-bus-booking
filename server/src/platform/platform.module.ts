import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { StaffAuthModule } from '../staff-auth/staff-auth.module.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

// Platform admin: operators, their first admins, shared stations.
// Writes: Operator, Station, StaffUser, StaffToken
// Routes: /platform/*
@Module({
  imports: [AuditModule, MessagesModule, StaffAuthModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
