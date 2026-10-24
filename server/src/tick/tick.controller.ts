import { Controller } from '@nestjs/common';
import { TickService } from './tick.service.js';

@Controller('internal')
export class TickController {
  constructor(private readonly tickService: TickService) {}
}
