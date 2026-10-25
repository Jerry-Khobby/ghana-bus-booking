import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { BusType } from '../../generated/prisma/enums.js';

export class SearchTripsQueryDto {
  /** Origin station id. */
  @IsUUID()
  from: string;

  /** Destination station id. */
  @IsUUID()
  to: string;

  /** Travel day, YYYY-MM-DD. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'date must be a real calendar day' })
  date: string;

  /** Only buses loading right now. */
  @IsOptional()
  // Query strings are text: without this, "false" would be truthy
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  loadingNow?: boolean;

  /** Repeatable: ?busType=AC_COACH&busType=MINIBUS */
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(BusType, { each: true })
  busType?: BusType[];

  /** Leaves (or starts loading) at or after this time, HH:mm. */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'departAfter must be HH:mm',
  })
  departAfter?: string;
}
