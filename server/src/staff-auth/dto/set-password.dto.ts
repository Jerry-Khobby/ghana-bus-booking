import { IsString, MaxLength } from 'class-validator';

export class SetPasswordDto {
  /** The token from the invite or reset link. */
  @IsString()
  @MaxLength(200)
  token: string;

  /** At least 10 characters and not a common password. */
  @IsString()
  @MaxLength(200)
  password: string;
}
