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

export class SellWalkInDto {
  /** Leave out to get the lowest free seat number. */
  @IsOptional()
  @IsString()
  @Length(1, 10)
  seatLabel?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  passengerName?: string;

  /** The passenger's phone, for the manifest. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  /** If given, the ticket is emailed; otherwise the agent prints it. */
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsIn(['CASH', 'MOMO'])
  method: 'CASH' | 'MOMO';

  /** The number to charge, for MOMO. */
  @ValidateIf((o: SellWalkInDto) => o.method === 'MOMO')
  @IsString()
  @Length(9, 20)
  momoPhone?: string;

  @ValidateIf((o: SellWalkInDto) => o.method === 'MOMO')
  @IsEnum(MomoNetwork)
  network?: MomoNetwork;
}
