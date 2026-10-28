import { IsIn, IsOptional, Matches } from 'class-validator';
import type { RangePreset } from '../report-range.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  /** today, 7d (the default) or 30d, ending today. Or use from and to. */
  @IsOptional()
  @IsIn(['today', '7d', '30d'])
  range?: RangePreset;

  /** First day, YYYY-MM-DD. */
  @IsOptional()
  @Matches(DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  /** Last day, YYYY-MM-DD (inclusive). */
  @IsOptional()
  @Matches(DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
