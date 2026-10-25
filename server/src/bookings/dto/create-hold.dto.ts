import { IsString, IsUUID, Length } from 'class-validator';

export class CreateHoldDto {
  @IsUUID()
  tripId: string;

  /** The seat's label on the seat map, e.g. "14". */
  @IsString()
  @Length(1, 10)
  seatLabel: string;
}
