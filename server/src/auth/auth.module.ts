import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

// Passenger sign-in by email code, token issue and refresh, the passenger profile.
// Writes: Passenger, OtpCode, RefreshToken
// Routes: /auth/otp/request, /auth/otp/verify, /auth/refresh, /auth/logout, /me
@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
