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
  Put,
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
import { CreateBusDto, UpdateBusDto } from './dto/bus.dto.js';
import { LayoutDto } from './dto/layout.dto.js';
import { FleetService } from './fleet.service.js';

@ApiTags('Operator admin')
@ApiBearerAuth()
@Roles(StaffRole.OPERATOR_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  /** Seat layouts. */
  @Get('layouts')
  listLayouts(@CurrentUser() user: StaffUser) {
    return this.fleet.listLayouts(adminContext(user));
  }

  /** Layout editor (open). */
  @Get('layouts/:id')
  getLayout(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fleet.getLayout(adminContext(user), id);
  }

  /** Layout editor → New layout → Save. */
  @Post('layouts')
  createLayout(
    @CurrentUser() user: StaffUser,
    @Body() dto: LayoutDto,
    @Req() req: Request,
  ) {
    return this.fleet.createLayout(adminContext(user, req.ip), dto);
  }

  /** Layout editor → Save layout. */
  @Put('layouts/:id')
  updateLayout(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LayoutDto,
    @Req() req: Request,
  ) {
    return this.fleet.updateLayout(adminContext(user, req.ip), id, dto);
  }

  /** Seat layouts: remove one no bus uses. */
  @Post('layouts/:id/archive')
  @HttpCode(HttpStatus.OK)
  archiveLayout(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.fleet.archiveLayout(adminContext(user, req.ip), id);
  }

  /** Buses. */
  @Get('buses')
  listBuses(@CurrentUser() user: StaffUser) {
    return this.fleet.listBuses(adminContext(user));
  }

  /** Buses → Save bus. */
  @Post('buses')
  createBus(
    @CurrentUser() user: StaffUser,
    @Body() dto: CreateBusDto,
    @Req() req: Request,
  ) {
    return this.fleet.createBus(adminContext(user, req.ip), dto);
  }

  /** Buses: type, layout, status. */
  @Patch('buses/:id')
  updateBus(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusDto,
    @Req() req: Request,
  ) {
    return this.fleet.updateBus(adminContext(user, req.ip), id, dto);
  }
}
