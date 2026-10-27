import { IsString, Matches, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MaxLength(254)
  email: string;

  /** The 6 digits from the email. */
  @Matches(/^\d{6}$/, { message: 'code must be the 6 digits from the email' })
  code: string;
}
