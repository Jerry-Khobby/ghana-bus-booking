import { StrictLimit } from '../common/rate-limits.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../common/auth/public.decorator.js';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { BookingsService } from './bookings.service.js';
import { CreateHoldDto } from './dto/create-hold.dto.js';
import { HOLD_TOKEN_HEADER, HoldTokenGuard } from './hold-token.guard.js';

// Guests and passengers alike. Whoever takes a seat gets a holdToken and
// sends it back as X-Hold-Token to read or release the hold.
@ApiTags('Holds')
@Public()
@Controller('holds')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /** Pick a seat → Continue. Holds the seat for the operator's hold time. */
  @Post()
  @StrictLimit()
  @ApiHeader({
    name: 'X-Hold-Token',
    required: false,
    description: 'Your current hold on this trip, if any; it is released',
  })
  createHold(
    @Body() dto: CreateHoldDto,
    @Headers(HOLD_TOKEN_HEADER) previousToken?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.bookingsService.createHold(
      dto,
      previousToken,
      user?.typ === 'passenger' ? user.sub : undefined,
    );
  }

  /** Pay screen: summary and the "seat held for 03:42" timer. */
  @Get(':id')
  @UseGuards(HoldTokenGuard)
  @ApiHeader({ name: 'X-Hold-Token', required: true })
  getHold(@Param('id') id: string) {
    return this.bookingsService.getHold(id);
  }

  /** Cancel and release my seat. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(HoldTokenGuard)
  @ApiHeader({ name: 'X-Hold-Token', required: true })
  releaseHold(@Param('id') id: string) {
    return this.bookingsService.releaseHold(id);
  }
}
