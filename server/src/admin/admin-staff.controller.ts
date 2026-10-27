import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { StaffUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Roles, RolesGuard } from '../common/auth/roles.js';
import { StaffRole } from '../generated/prisma/enums.js';
import { adminContext } from './admin-context.js';
import { AdminStaffService } from './admin-staff.service.js';
import {
  CashQueryDto,
  InviteAgentDto,
  SettleCashDto,
  UpdateAgentDto,
} from './dto/agent.dto.js';

@ApiTags('Operator admin')
@ApiBearerAuth()
@Roles(StaffRole.OPERATOR_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin')
export class AdminStaffController {
  constructor(private readonly staff: AdminStaffService) {}

  /** Agents. */
  @Get('agents')
  listAgents(@CurrentUser() user: StaffUser) {
    return this.staff.listAgents(adminContext(user));
  }

  /** Agents → Send invite. */
  @Post('agents')
  inviteAgent(
    @CurrentUser() user: StaffUser,
    @Body() dto: InviteAgentDto,
    @Req() req: Request,
  ) {
    return this.staff.inviteAgent(adminContext(user, req.ip), dto);
  }

  /** Agents: station, bays, disable. */
  @Patch('agents/:id')
  updateAgent(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
    @Req() req: Request,
  ) {
    return this.staff.updateAgent(adminContext(user, req.ip), id, dto);
  }

  /** Agents → Reset password. */
  @Post('agents/:id/reset-password')
  @HttpCode(HttpStatus.ACCEPTED)
  resetPassword(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.staff.resetPassword(adminContext(user, req.ip), id);
  }

  /** Agents → Resend invite. */
  @Post('agents/:id/resend-invite')
  @HttpCode(HttpStatus.ACCEPTED)
  resendInvite(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.staff.resendInvite(adminContext(user, req.ip), id);
  }

  /** Reports → Cash to collect. */
  @Get('cash')
  // Only unsettled cash is listed for now; the query is validated for later
  cash(@CurrentUser() user: StaffUser, @Query() _query: CashQueryDto) {
    return this.staff.unsettledCash(adminContext(user));
  }

  /** Mark agent cash collected. */
  @Post('cash/settle')
  @HttpCode(HttpStatus.OK)
  settle(
    @CurrentUser() user: StaffUser,
    @Body() dto: SettleCashDto,
    @Req() req: Request,
  ) {
    return this.staff.settleCash(adminContext(user, req.ip), dto);
  }
}
