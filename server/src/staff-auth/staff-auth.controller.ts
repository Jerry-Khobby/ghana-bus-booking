import { StrictLimit } from '../common/rate-limits.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { setRefreshCookie } from '../auth/refresh-cookie.js';
import type { Session } from '../auth/tokens.service.js';
import type { StaffUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import { Roles, RolesGuard } from '../common/auth/roles.js';
import { SetPasswordDto } from './dto/set-password.dto.js';
import { StaffLoginDto } from './dto/staff-login.dto.js';
import { StaffAuthService } from './staff-auth.service.js';

const client = (req: Request) => ({
  ip: req.ip,
  userAgent: req.header('user-agent'),
});

/** Sends the refresh cookie and returns what the sign-in screen needs. */
function signedIn(
  res: Response,
  result: { session: Session; staff: unknown; home: string },
) {
  setRefreshCookie(
    res,
    result.session.refreshToken,
    result.session.refreshExpiresAt,
  );
  return {
    accessToken: result.session.accessToken,
    staff: result.staff,
    home: result.home,
  };
}

// Staff refresh and sign out through the shared /auth/refresh and /auth/logout.
@ApiTags('Staff auth')
@Controller('staff')
export class StaffAuthController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  /** Staff sign in. */
  @Public()
  @Post('auth/login')
  @StrictLimit()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: StaffLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return signedIn(
      res,
      await this.staffAuth.login(dto.email, dto.password, dto.as, client(req)),
    );
  }

  /** Set password, from the invite email. */
  @Public()
  @Post('auth/accept-invite')
  @StrictLimit()
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Body() dto: SetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return signedIn(
      res,
      await this.staffAuth.acceptInvite(dto.token, dto.password, client(req)),
    );
  }

  /** Set a new password, from the reset email. */
  @Public()
  @Post('auth/reset-password')
  @StrictLimit()
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: SetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return signedIn(
      res,
      await this.staffAuth.resetPassword(dto.token, dto.password, client(req)),
    );
  }

  /** Console and dashboard headers. */
  @Get('me')
  @ApiBearerAuth()
  @Roles()
  @UseGuards(RolesGuard)
  me(@CurrentUser() user: StaffUser) {
    return this.staffAuth.me(user.sub);
  }
}
