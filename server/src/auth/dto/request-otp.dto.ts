import { IsString, MaxLength } from 'class-validator';

export class RequestOtpDto {
  /** Checked in the service so a bad address is INVALID_EMAIL. */
  @IsString()
  @MaxLength(254)
  email: string;
}
