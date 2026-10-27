import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { requireSecret } from '../common/secrets.js';
import { MessagesModule } from '../messages/messages.module.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';

// Passenger sign-in by email code, token issue and refresh, the passenger's
// profile. TokensService also serves staff sign-in.
// Writes: Passenger, OtpCode, RefreshToken
// Routes: /auth/otp/request, /auth/otp/verify, /auth/refresh, /auth/logout, /me
@Module({
  imports: [
    // Global, so the app-wide JwtAuthGuard can verify tokens
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: requireSecret('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256', expiresIn: '15m' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    MessagesModule,
  ],
  controllers: [AuthController, MeController],
  providers: [AuthService, TokensService],
  exports: [TokensService],
})
export class AuthModule {}
