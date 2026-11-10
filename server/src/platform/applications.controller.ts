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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { StaffUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import { Roles, RolesGuard } from '../common/auth/roles.js';
import { StrictLimit } from '../common/rate-limits.js';
import { StaffRole } from '../generated/prisma/enums.js';
import { ApplicationsService } from './applications.service.js';
import {
  ApplyDto,
  ApproveApplicationDto,
  DeclineApplicationDto,
  ListApplicationsQueryDto,
} from './dto/application.dto.js';

/** The public "Join Seatline" form. */
@ApiTags('Join Seatline')
@Public()
@Controller('applications')
export class JoinController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @StrictLimit()
  @HttpCode(HttpStatus.ACCEPTED)
  apply(@Body() dto: ApplyDto) {
    return this.applications.apply(dto);
  }
}

/** Platform admins reviewing who asked to join. */
@ApiTags('Platform admin')
@ApiBearerAuth()
@Roles(StaffRole.PLATFORM_ADMIN)
@UseGuards(RolesGuard)
@Controller('platform/applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  list(@Query() query: ListApplicationsQueryDto) {
    return this.applications.list(query.status);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveApplicationDto,
    @Req() req: Request,
  ) {
    return this.applications.approve(
      { staffId: user.sub, ip: req.ip },
      id,
      dto,
    );
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: StaffUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineApplicationDto,
    @Req() req: Request,
  ) {
    return this.applications.decline(
      { staffId: user.sub, ip: req.ip },
      id,
      dto,
    );
  }
}
