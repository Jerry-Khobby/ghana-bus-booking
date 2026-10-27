import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TicketAccessDto {
  /** The signed token from the ticket link in the email. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  t?: string;
}
