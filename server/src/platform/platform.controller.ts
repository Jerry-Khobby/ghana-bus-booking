import { Controller } from '@nestjs/common';
import { PlatformService } from './platform.service.js';

@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}
}
