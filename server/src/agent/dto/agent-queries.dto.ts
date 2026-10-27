import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

export class ConsoleQueryDto {
  /** One of your bays; defaults to the first. */
  @IsOptional()
  @IsUUID()
  bayId?: string;
}

export class SalesQueryDto {
  /** YYYY-MM-DD; defaults to today. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date?: string;
}
