import { Controller } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service.js';

@Controller('staff')
export class StaffAuthController {
  constructor(private readonly staffAuthService: StaffAuthService) {}
}
