import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StationsQueryDto {
  /** Matches station name or city, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;
}
