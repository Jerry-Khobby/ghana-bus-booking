import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { HOLD_TOKEN_HEADER } from '../bookings/hold-token.guard.js';
import { CatalogService } from './catalog.service.js';
import { SearchTripsQueryDto } from './dto/search-trips-query.dto.js';
import { StationsQueryDto } from './dto/stations-query.dto.js';

// Public: no sign-in needed to browse. Routes span several prefixes, so each
// handler sets its full path.
@ApiTags('Catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  /** Home: the From / To pickers. */
  @Get('stations')
  @Header('Cache-Control', 'public, max-age=600')
  listStations(@Query() query: StationsQueryDto) {
    return this.catalogService.listStations(query);
  }

  /** Buses on the route. */
  @Get('trips/search')
  searchTrips(@Query() query: SearchTripsQueryDto) {
    return this.catalogService.searchTrips(query);
  }

  /** Seat map header. */
  @Get('trips/:id')
  getTrip(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.getTrip(id);
  }

  /** Pick a seat. */
  @Get('trips/:id/seats')
  @ApiHeader({
    name: 'X-Hold-Token',
    required: false,
    description: 'Your hold token; your held seat comes back as MINE',
  })
  getSeatMap(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(HOLD_TOKEN_HEADER) holdToken?: string,
  ) {
    return this.catalogService.getSeatMap(id, holdToken);
  }
}
