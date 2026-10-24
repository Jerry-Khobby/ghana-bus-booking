import { Controller } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';

// Routes span several prefixes, so each handler sets its full path.
@Controller()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}
}
