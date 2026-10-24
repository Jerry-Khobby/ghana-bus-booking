import { Module } from '@nestjs/common';
import { StaffAuthController } from './staff-auth.controller.js';
import { StaffAuthService } from './staff-auth.service.js';

// Staff login, invite acceptance, password reset.
// Writes: StaffUser, StaffToken, RefreshToken
// Routes: /staff/auth/*, /staff/me
@Module({
  controllers: [StaffAuthController],
  providers: [StaffAuthService],
  exports: [StaffAuthService],
})
export class StaffAuthModule {}
