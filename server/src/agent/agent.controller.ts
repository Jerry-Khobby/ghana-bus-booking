import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { StaffUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { AllowQueryToken } from '../common/auth/query-token.decorator.js';
import { Roles, RolesGuard } from '../common/auth/roles.js';
import { ConsoleStreamQueryDto } from '../realtime/stream-query.dto.js';
import { StaffRole } from '../generated/prisma/enums.js';
import { AgentService } from './agent.service.js';
import { ConsoleQueryDto, SalesQueryDto } from './dto/agent-queries.dto.js';
import { DepartDto } from './dto/depart.dto.js';
import { ScanDto } from './dto/scan.dto.js';
import { SellWalkInDto } from './dto/sell-walk-in.dto.js';
import { VoidSaleDto } from './dto/void.dto.js';
import { ScanningService } from './scanning.service.js';
import { WalkInsService } from './walk-ins.service.js';

// Agents work their own bays; operator admins can sell and scan at any bay of
// their operator.
@ApiTags('Agent console')
@ApiBearerAuth()
@Roles(StaffRole.AGENT, StaffRole.OPERATOR_ADMIN)
@UseGuards(RolesGuard)
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly walkIns: WalkInsService,
    private readonly scanning: ScanningService,
  ) {}

  /** Loading console for one bay. */
  @Get('console')
  console(@CurrentUser() user: StaffUser, @Query() query: ConsoleQueryDto) {
    return this.agent.console(user, query.bayId);
  }

  /**
   * Loading console, live: `event: console` with the whole console after
   * every change. Send the access token as ?accessToken=.
   */
  @Sse('console/stream')
  @AllowQueryToken()
  consoleStream(
    @CurrentUser() user: StaffUser,
    @Query() query: ConsoleStreamQueryDto,
  ) {
    return this.agent.consoleStream(user, query.bayId);
  }

  /** Passenger list for the bus. */
  @Get('trips/:id/manifest')
  manifest(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agent.manifest(user, id);
  }

  /** Console: the scheduled bus at the bay starts loading. */
  @Post('trips/:id/start-loading')
  @HttpCode(HttpStatus.OK)
  startLoading(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agent.startLoading(user, id);
  }

  /** Sell a walk-in seat: 201 for cash, 202 while a MoMo prompt is out. */
  @Post('trips/:id/walk-ins')
  async sellWalkIn(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellWalkInDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accepted, ...sale } = await this.walkIns.sell(user, id, dto);
    res.status(accepted ? HttpStatus.ACCEPTED : HttpStatus.CREATED);
    return sale;
  }

  /** Walk-in MoMo: waiting for approval. */
  @Get('payments/:id')
  payment(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.walkIns.payment(user, id);
  }

  /** Undo a wrong walk-in sale (admins only). */
  @Post('bookings/:code/void')
  @HttpCode(HttpStatus.OK)
  @Roles(StaffRole.OPERATOR_ADMIN)
  void(
    @CurrentUser() user: StaffUser,
    @Param('code') code: string,
    @Body() dto: VoidSaleDto,
    @Req() req: Request,
  ) {
    return this.walkIns.void(user, code.toUpperCase(), dto.reason, req.ip);
  }

  /** Scan ticket: checks only, doesn't board. */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  scan(@CurrentUser() user: StaffUser, @Body() dto: ScanDto) {
    return this.scanning.scan(user, dto);
  }

  /** Scan → Mark as boarded. */
  @Post('tickets/:code/board')
  @HttpCode(HttpStatus.OK)
  board(@CurrentUser() user: StaffUser, @Param('code') code: string) {
    return this.scanning.board(user, code);
  }

  /** Mark as departed. */
  @Post('trips/:id/depart')
  @HttpCode(HttpStatus.OK)
  depart(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DepartDto,
  ) {
    return this.agent.depart(user, id, dto.confirmUnboarded ?? false);
  }

  /** Cash I took today. */
  @Get('sales')
  sales(@CurrentUser() user: StaffUser, @Query() query: SalesQueryDto) {
    return this.agent.sales(user, query.date);
  }
}
