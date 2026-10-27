import {
  Body,
  Controller,
  Get,
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
import {
  BaysQueryDto,
  CreateBayDto,
  CreateRouteDto,
  UpdateFaresDto,
  UpdateRouteDto,
} from './dto/network.dto.js';
import { NetworkService } from './network.service.js';

@ApiTags('Operator admin')
@ApiBearerAuth()
@Roles(StaffRole.OPERATOR_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin')
export class NetworkController {
  constructor(private readonly network: NetworkService) {}

  /** Routes and fares. */
  @Get('routes')
  listRoutes(@CurrentUser() user: StaffUser) {
    return this.network.listRoutes(adminContext(user));
  }

  /** Routes → Save route. */
  @Post('routes')
  createRoute(
    @CurrentUser() user: StaffUser,
    @Body() dto: CreateRouteDto,
    @Req() req: Request,
  ) {
    return this.network.createRoute(adminContext(user, req.ip), dto);
  }

  // Before routes/:id, so "fares" isn't read as an id
  /** Routes → Save fare changes. */
  @Patch('routes/fares')
  updateFares(
    @CurrentUser() user: StaffUser,
    @Body() dto: UpdateFaresDto,
    @Req() req: Request,
  ) {
    return this.network.updateFares(adminContext(user, req.ip), dto);
  }

  /** Routes: deactivate, journey time. */
  @Patch('routes/:id')
  updateRoute(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
    @Req() req: Request,
  ) {
    return this.network.updateRoute(adminContext(user, req.ip), id, dto);
  }

  /** New trip bay picker, Agents form. */
  @Get('bays')
  listBays(@CurrentUser() user: StaffUser, @Query() query: BaysQueryDto) {
    return this.network.listBays(adminContext(user), query.stationId);
  }

  /** Settings: add a bay. */
  @Post('bays')
  createBay(
    @CurrentUser() user: StaffUser,
    @Body() dto: CreateBayDto,
    @Req() req: Request,
  ) {
    return this.network.createBay(adminContext(user, req.ip), dto);
  }
}
