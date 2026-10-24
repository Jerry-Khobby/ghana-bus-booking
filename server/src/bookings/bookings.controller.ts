import { Controller } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';

@Controller('holds')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}
}
