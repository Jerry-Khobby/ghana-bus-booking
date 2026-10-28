import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OperatorStatus } from '../../generated/prisma/enums.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CreateOperatorDto {
  @IsString()
  @Length(2, 80)
  name: string;

  /** Lowercase letters, digits and dashes, e.g. "coastline-express". */
  @Matches(SLUG, {
    message: 'slug must be lowercase letters, digits and dashes',
  })
  @MaxLength(60)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /** Added to every online booking, in pesewas (100 = GH¢ 1.00). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  serviceFeePesewas?: number;

  /** How long a seat stays held while the passenger pays. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  holdMinutes?: number;
}

export class UpdateOperatorDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  serviceFeePesewas?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  holdMinutes?: number;

  /** SUSPENDED hides the operator from search and stops new sales. */
  @IsOptional()
  @IsEnum(OperatorStatus)
  status?: OperatorStatus;
}

export class InviteOperatorAdminDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class CreateStationDto {
  /** e.g. "Circle", or "Main station". */
  @IsString()
  @Length(1, 60)
  name: string;

  @IsString()
  @Length(1, 60)
  city: string;

  @IsString()
  @Length(1, 60)
  region: string;
}

export class UpdateStationDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  region?: string;

  /** false hides the station from the From / To pickers. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
