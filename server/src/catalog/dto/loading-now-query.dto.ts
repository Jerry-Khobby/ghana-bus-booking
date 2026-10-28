import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class LoadingNowQueryDto {
  /** Origin station id; leave out for every station. */
  @IsOptional()
  @IsUUID()
  from?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 6;
}
