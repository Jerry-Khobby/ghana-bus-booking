import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  /** Pre-fills the mobile money number; send "" to remove it. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
