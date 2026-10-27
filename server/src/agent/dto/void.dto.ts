import { IsString, Length } from 'class-validator';

export class VoidSaleDto {
  /** Why: kept in the audit log. */
  @IsString()
  @Length(3, 300)
  reason: string;
}
