import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { TickSecretGuard } from './tick-secret.guard.js';
import { TickService } from './tick.service.js';

// Called by the GitHub Actions schedule (.github/workflows/tick.yml)
@ApiTags('System')
@Controller('internal')
export class TickController {
  constructor(private readonly tickService: TickService) {}

  /** Sweeps holds, payments, trips, unsent email and old rows. */
  @Post('tick')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TickSecretGuard)
  @ApiHeader({ name: 'X-Tick-Secret', required: true })
  tick() {
    return this.tickService.run();
  }
}
