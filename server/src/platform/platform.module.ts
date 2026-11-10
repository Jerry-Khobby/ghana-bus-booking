import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { StaffAuthModule } from '../staff-auth/staff-auth.module.js';
import {
  ApplicationsController,
  JoinController,
} from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

// Platform admin: operators, their first admins, shared stations, and the
// bus companies that applied to join.
// Writes: Operator, Station, StaffUser, StaffToken, OperatorApplication;
// deleting an operator that never sold a seat removes its fleet and trips
// Routes: /platform/*, POST /applications (public)
@Module({
  imports: [
    AdminModule,
    AuditModule,
    AuthModule,
    MessagesModule,
    StaffAuthModule,
  ],
  controllers: [PlatformController, ApplicationsController, JoinController],
  providers: [PlatformService, ApplicationsService],
})
export class PlatformModule {}
