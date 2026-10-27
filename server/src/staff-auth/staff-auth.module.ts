import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StaffAuthController } from './staff-auth.controller.js';
import { StaffAuthService } from './staff-auth.service.js';

// Staff login, invite acceptance, password reset. Sessions come from the
// shared TokensService (12-hour staff refresh tokens).
// Writes: StaffUser, StaffToken, RefreshToken
// Routes: /staff/auth/*, /staff/me
@Module({
  imports: [AuthModule],
  controllers: [StaffAuthController],
  providers: [StaffAuthService],
  exports: [StaffAuthService],
})
export class StaffAuthModule {}
