import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { PassengerUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { PassengerGuard } from '../common/auth/passenger.guard.js';
import { Public } from '../common/auth/public.decorator.js';
import { AuthService } from './auth.service.js';
import { RequestOtpDto } from './dto/request-otp.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import { TokensService } from './tokens.service.js';

const client = (req: Request) => ({
  ip: req.ip,
  userAgent: req.header('user-agent'),
});

/** Sign in, refresh and sign out. The refresh token travels in a cookie. */
@ApiTags('Passenger auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  /** Sign in, step 1: emails a 6-digit code. */
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.auth.requestOtp(dto.email, client(req));
  }

  /** Sign in, step 2: the code from the email. Sets the refresh cookie. */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, passenger } = await this.auth.verifyOtp(
      dto.email,
      dto.code,
      client(req),
    );
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    return { accessToken: session.accessToken, passenger };
  }

  /** A new access token for passengers and staff alike; rotates the cookie. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.tokens.refresh(
        readRefreshCookie(req),
        client(req),
      );
      setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
      return { accessToken: session.accessToken };
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  }

  /** Sign out. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.tokens.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
  }
}

/** The signed-in passenger's own profile. */
@ApiTags('Passenger auth')
@ApiBearerAuth()
@UseGuards(PassengerGuard)
@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  /** My tickets header. */
  @Get()
  me(@CurrentUser() user: PassengerUser) {
    return this.auth.me(user.sub);
  }

  /** Profile: name, and the phone that pre-fills mobile money. */
  @Patch()
  updateMe(@CurrentUser() user: PassengerUser, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(user.sub, dto);
  }
}
