import { StrictLimit } from '../common/rate-limits.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { StaffUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Roles, RolesGuard } from '../common/auth/roles.js';
import { StaffRole } from '../generated/prisma/enums.js';
import {
  CreateOperatorDto,
  CreateStationDto,
  InviteOperatorAdminDto,
  SuspendOperatorDto,
  UpdateOperatorDto,
  UpdateStationDto,
} from './dto/platform.dto.js';
import { PlatformService, type PlatformContext } from './platform.service.js';

const ctx = (user: StaffUser, req: Request): PlatformContext => ({
  staffId: user.sub,
  ip: req.ip,
});

// Screens: /platform in the web app (bus companies, their admins, stations).
@ApiTags('Platform admin')
@ApiBearerAuth()
@Roles(StaffRole.PLATFORM_ADMIN)
@UseGuards(RolesGuard)
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  /** List operators. */
  @Get('operators')
  listOperators() {
    return this.platform.listOperators();
  }

  /** Create an operator. */
  @Post('operators')
  createOperator(
    @CurrentUser() user: StaffUser,
    @Body() dto: CreateOperatorDto,
    @Req() req: Request,
  ) {
    return this.platform.createOperator(ctx(user, req), dto);
  }

  /** Edit, or suspend (suspended operators vanish from search). */
  @Patch('operators/:id')
  updateOperator(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperatorDto,
    @Req() req: Request,
  ) {
    return this.platform.updateOperator(ctx(user, req), id, dto);
  }

  /** What suspending or deleting would touch, and whether delete is allowed. */
  @Get('operators/:id/impact')
  operatorImpact(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.operatorImpact(id);
  }

  /** Suspend, and optionally cancel its upcoming trips with refunds. */
  @Post('operators/:id/suspend')
  @HttpCode(HttpStatus.OK)
  suspendOperator(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendOperatorDto,
    @Req() req: Request,
  ) {
    return this.platform.suspendOperator(ctx(user, req), id, dto);
  }

  /** Delete an operator that never had a booking. */
  @Delete('operators/:id')
  deleteOperator(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.platform.deleteOperator(ctx(user, req), id);
  }

  /** Invite the operator's first OPERATOR_ADMIN. */
  @Post('operators/:id/admins')
  inviteAdmin(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteOperatorAdminDto,
    @Req() req: Request,
  ) {
    return this.platform.inviteOperatorAdmin(ctx(user, req), id, dto);
  }

  /** The operator's admins and whether they have joined. */
  @Get('operators/:id/admins')
  listAdmins(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.listOperatorAdmins(id);
  }

  /** Locked out: emails a new invite, or a reset link if they've joined. */
  @Post('admins/:id/send-link')
  @HttpCode(HttpStatus.OK)
  @StrictLimit()
  sendAdminLink(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.platform.sendAdminLink(ctx(user, req), id);
  }

  /** Every station, inactive ones included. */
  @Get('stations')
  listStations() {
    return this.platform.listStations();
  }

  /** Add a station. */
  @Post('stations')
  createStation(
    @CurrentUser() user: StaffUser,
    @Body() dto: CreateStationDto,
    @Req() req: Request,
  ) {
    return this.platform.createStation(ctx(user, req), dto);
  }

  /** Edit or deactivate a station. */
  @Patch('stations/:id')
  updateStation(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStationDto,
    @Req() req: Request,
  ) {
    return this.platform.updateStation(ctx(user, req), id, dto);
  }
}
