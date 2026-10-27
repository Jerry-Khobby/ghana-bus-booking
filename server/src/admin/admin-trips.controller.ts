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
import { AdminTripsService } from './admin-trips.service.js';
import {
  CancelTripDto,
  CreateTripDto,
  OverviewQueryDto,
  TripsQueryDto,
  UpdateTripDto,
} from './dto/trip.dto.js';

@ApiTags('Operator admin')
@ApiBearerAuth()
@Roles(StaffRole.OPERATOR_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin')
export class AdminTripsController {
  constructor(private readonly trips: AdminTripsService) {}

  /** Overview: today's numbers and trips. */
  @Get('overview')
  overview(@CurrentUser() user: StaffUser, @Query() query: OverviewQueryDto) {
    return this.trips.overview(adminContext(user), query.date);
  }

  /** Trips. */
  @Get('trips')
  list(@CurrentUser() user: StaffUser, @Query() query: TripsQueryDto) {
    return this.trips.list(adminContext(user), query);
  }

  /** New trip → Publish trip. */
  @Post('trips')
  create(
    @CurrentUser() user: StaffUser,
    @Body() dto: CreateTripDto,
    @Req() req: Request,
  ) {
    return this.trips.create(adminContext(user, req.ip), dto);
  }

  /** Trips → Edit. */
  @Get('trips/:id')
  get(@CurrentUser() user: StaffUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.get(adminContext(user), id);
  }

  /** Edit trip → Save. */
  @Patch('trips/:id')
  update(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripDto,
    @Req() req: Request,
  ) {
    return this.trips.update(adminContext(user, req.ip), id, dto);
  }

  /** Edit trip → Cancel trip. */
  @Post('trips/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTripDto,
    @Req() req: Request,
  ) {
    return this.trips.cancel(adminContext(user, req.ip), id, dto.reason);
  }
}
