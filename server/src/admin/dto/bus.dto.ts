import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';
import { BusStatus, BusType } from '../../generated/prisma/enums.js';

export class CreateBusDto {
  /** Stored uppercase, e.g. "GR 4471-24". */
  @IsString()
  @Length(3, 15)
  plate: string;

  @IsEnum(BusType)
  type: BusType;

  @IsUUID()
  layoutId: string;
}

export class UpdateBusDto {
  @IsOptional()
  @IsEnum(BusType)
  type?: BusType;

  @IsOptional()
  @IsUUID()
  layoutId?: string;

  @IsOptional()
  @IsEnum(BusStatus)
  status?: BusStatus;

  /** YYYY-MM-DD while IN_WORKSHOP; null clears it. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsISO8601({ strict: true })
  backInServiceOn?: string | null;
}
