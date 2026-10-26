import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MomoNetwork } from '../../generated/prisma/enums.js';

export class PayHoldDto {
  /** Cash is only taken by agents at the station. */
  @IsIn(['MOMO', 'CARD'])
  method: 'MOMO' | 'CARD';

  /** Mobile money number: 024 000 0000, 24 000 0000 or +233 24 000 0000. */
  @ValidateIf((o: PayHoldDto) => o.method === 'MOMO')
  @IsString()
  @Length(9, 20)
  phone?: string;

  @ValidateIf((o: PayHoldDto) => o.method === 'MOMO')
  @IsEnum(MomoNetwork)
  network?: MomoNetwork;

  /** Where the ticket goes. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  contactEmail: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  passengerName?: string;
}
