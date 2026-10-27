import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { PassengerUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { PassengerGuard } from '../common/auth/passenger.guard.js';
import { MyTicketsQueryDto } from './dto/my-tickets-query.dto.js';
import { TicketsService } from './tickets.service.js';

@ApiTags('Tickets')
@ApiBearerAuth()
@UseGuards(PassengerGuard)
@Controller('me/tickets')
export class MyTicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  /** My tickets: Upcoming or Past, 20 at a time. */
  @Get()
  myTickets(
    @CurrentUser() user: PassengerUser,
    @Query() query: MyTicketsQueryDto,
  ) {
    return this.ticketsService.myTickets(user.sub, query);
  }
}
