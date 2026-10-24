import { Controller } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

// Routes span several prefixes, so each handler sets its full path.
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}
}
