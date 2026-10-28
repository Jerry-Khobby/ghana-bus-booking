import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Seat map and payment streams: the guest's hold token, in the URL. */
export class HoldStreamQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  holdToken?: string;
}

/** The agent console stream. */
export class ConsoleStreamQueryDto {
  /** One of your bays; defaults to the first. */
  @IsOptional()
  @IsUUID()
  bayId?: string;

  /** Your access token: an EventSource can't send headers. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessToken?: string;
}
