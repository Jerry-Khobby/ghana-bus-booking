import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiHeader, ApiProduces, ApiTags } from '@nestjs/swagger';
import { HOLD_TOKEN_HEADER } from '../bookings/hold-token.guard.js';
import { TicketAccessDto } from './dto/ticket-access.dto.js';
import { TicketsService } from './tickets.service.js';

const holdTokenHeader = {
  name: 'X-Hold-Token',
  required: false,
  description: 'Instead of ?t=: the holdToken the ticket was paid with',
};

// Guests open tickets with the signed ?t= from their link, or with their hold
// token straight after paying. /me/tickets comes with passenger accounts.
@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  /** Your ticket. */
  @Get(':code')
  @ApiHeader(holdTokenHeader)
  getTicket(
    @Param('code') code: string,
    @Query() query: TicketAccessDto,
    @Headers(HOLD_TOKEN_HEADER) holdToken?: string,
  ) {
    return this.ticketsService.getTicket(code, { t: query.t, holdToken });
  }

  /** Save as PDF. */
  @Get(':code/pdf')
  @ApiHeader(holdTokenHeader)
  @ApiProduces('application/pdf')
  async getTicketPdf(
    @Param('code') code: string,
    @Query() query: TicketAccessDto,
    @Headers(HOLD_TOKEN_HEADER) holdToken?: string,
  ) {
    const pdf = await this.ticketsService.getTicketPdf(code, {
      t: query.t,
      holdToken,
    });
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="seatline-${code}.pdf"`,
    });
  }
}
