import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { DepartureMode, TripStatus } from '../../generated/prisma/enums.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTripDto {
  @IsUUID()
  routeId: string;

  @IsUUID()
  busId: string;

  /** A bay at the route's origin station. */
  @IsUUID()
  bayId: string;

  @IsEnum(DepartureMode)
  mode: DepartureMode;

  /** FIXED_TIME: when it leaves (must be in the future). */
  @IsOptional()
  @IsISO8601()
  departureAt?: string;

  /** WHEN_FULL: when loading starts. FIXED_TIME: defaults to an hour before. */
  @IsOptional()
  @IsISO8601()
  loadingStartsAt?: string;

  /** WHEN_FULL: leaves at this time even if not full. */
  @IsOptional()
  @IsISO8601()
  leaveBy?: string;

  /** Defaults to the route's base fare. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  farePesewas?: number;

  @IsOptional()
  @IsBoolean()
  onlineBookingOpen?: boolean;
}

export class UpdateTripDto {
  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsUUID()
  busId?: string;

  @IsOptional()
  @IsUUID()
  bayId?: string;

  @IsOptional()
  @IsEnum(DepartureMode)
  mode?: DepartureMode;

  @IsOptional()
  @IsISO8601()
  departureAt?: string;

  @IsOptional()
  @IsISO8601()
  loadingStartsAt?: string;

  @IsOptional()
  @IsISO8601()
  leaveBy?: string;

  /** Applies to new sales only; sold tickets keep their price. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  farePesewas?: number;

  @IsOptional()
  @IsBoolean()
  onlineBookingOpen?: boolean;
}

export class CancelTripDto {
  /** Kept with the trip and in the audit log. */
  @IsString()
  @Length(3, 300)
  reason: string;
}

export class TripsQueryDto {
  /** One day, YYYY-MM-DD (default today). Or use from and to. */
  @IsOptional()
  @Matches(DAY, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @Matches(DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  /** Inclusive. */
  @IsOptional()
  @Matches(DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  /** Repeatable: ?status=SCHEDULED&status=LOADING */
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(TripStatus, { each: true })
  status?: TripStatus[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class OverviewQueryDto {
  /** YYYY-MM-DD; defaults to today. */
  @IsOptional()
  @Matches(DAY, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}
