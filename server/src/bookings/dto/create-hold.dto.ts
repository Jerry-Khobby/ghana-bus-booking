import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

/** Seats one person can hold and pay for at once. */
export const MAX_SEATS_PER_HOLD = 6;

export class CreateHoldDto {
  @IsUUID()
  tripId: string;

  /** One seat's label on the seat map, e.g. "14". Send this or seatLabels. */
  @ValidateIf((o: CreateHoldDto) => o.seatLabels === undefined)
  @IsString()
  @Length(1, 10)
  seatLabel?: string;

  /** Several seats, held together on one timer and paid for once. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SEATS_PER_HOLD)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 10, { each: true })
  seatLabels?: string[];
}
