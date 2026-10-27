import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class ScanDto {
  /** The bus on the console: tickets for any other bus are WRONG_TRIP. */
  @IsUUID()
  tripId: string;

  /** What the camera read. Send this or code. */
  @ValidateIf((o: ScanDto) => !o.code)
  @IsString()
  @MaxLength(200)
  qrPayload?: string;

  /** A ticket code typed in by hand, e.g. SL-7Q4K-2M. */
  @IsOptional()
  @IsString()
  @Length(10, 12)
  code?: string;
}
