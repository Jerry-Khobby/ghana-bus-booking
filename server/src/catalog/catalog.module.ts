import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

// Public read side: stations, trip search, trip detail and seat maps.
// Writes: — (reads only)
// Routes: /stations, /trips/search, /trips/:id, /trips/:id/seats
// (/trips/:id/seats/stream comes with RealtimeModule in phase 8)
@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
