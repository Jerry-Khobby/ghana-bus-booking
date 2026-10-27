import { IsIn, IsString, MaxLength } from 'class-validator';

export class StaffLoginDto {
  @IsString()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;

  /** The toggle on the sign-in screen. */
  @IsIn(['AGENT', 'OPERATOR'])
  as: 'AGENT' | 'OPERATOR';
}
