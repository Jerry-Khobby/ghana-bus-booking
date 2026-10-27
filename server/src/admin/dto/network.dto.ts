import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateRouteDto {
  @IsUUID()
  originStationId: string;

  @IsUUID()
  destinationStationId: string;

  /** In pesewas: GH¢ 150.00 is 15000. */
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  baseFarePesewas: number;

  /** Journey time shown to passengers. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48 * 60)
  durationMinutes?: number;
}

export class UpdateRouteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48 * 60)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class FareChangeDto {
  @IsUUID()
  routeId: string;

  @IsInt()
  @Min(1)
  @Max(10_000_000)
  baseFarePesewas: number;
}

export class UpdateFaresDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FareChangeDto)
  fares: FareChangeDto[];
}

export class BaysQueryDto {
  @IsOptional()
  @IsUUID()
  stationId?: string;
}

export class CreateBayDto {
  @IsUUID()
  stationId: string;

  @IsInt()
  @Min(1)
  @Max(999)
  number: number;
}
