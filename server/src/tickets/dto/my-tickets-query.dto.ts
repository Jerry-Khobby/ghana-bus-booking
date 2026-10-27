import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class MyTicketsQueryDto {
  @IsOptional()
  @IsIn(['upcoming', 'past'])
  scope: 'upcoming' | 'past' = 'upcoming';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  /** nextCursor from the previous page. */
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
