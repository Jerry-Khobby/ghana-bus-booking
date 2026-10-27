import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class InviteAgentDto {
  @IsString()
  @Length(1, 80)
  name: string;

  /** Where the invite goes; also their sign-in. */
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** The station they work at. */
  @IsUUID()
  stationId: string;

  /** Bays at that station they load. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  bayIds: string[];
}

export class UpdateAgentDto {
  @IsOptional()
  @IsUUID()
  stationId?: string;

  /** Replaces their bays. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  bayIds?: string[];

  /** DISABLED signs them out everywhere; ACTIVE lets them back in. */
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

export class CashQueryDto {
  @IsOptional()
  @IsIn(['unsettled'])
  status?: 'unsettled';
}

export class SettleCashDto {
  @IsUUID()
  agentId: string;

  /** Everything this agent took up to this time counts as collected. */
  @IsISO8601()
  upTo: string;
}
