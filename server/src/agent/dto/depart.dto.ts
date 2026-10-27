import { IsBoolean, IsOptional } from 'class-validator';

export class DepartDto {
  /** Yes to "3 passengers have not boarded. Depart anyway?" */
  @IsOptional()
  @IsBoolean()
  confirmUnboarded?: boolean;
}
