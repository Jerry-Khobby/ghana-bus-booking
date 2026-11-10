import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApplicationStatus } from '../../generated/prisma/enums.js';
import { SLUG } from './platform.dto.js';

/** The public "Join Seatline" form. */
export class ApplyDto {
  @IsString()
  @Length(2, 80)
  companyName: string;

  /** Who will run the company on Seatline; approving invites them. */
  @IsString()
  @Length(2, 80)
  contactName: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  /** Checked in the service, so a bad number is INVALID_PHONE. */
  @IsString()
  @MaxLength(20)
  phone: string;

  /** Where the buses load, e.g. "Accra". */
  @IsString()
  @Length(2, 60)
  city: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  fleetSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  /** Hidden from people; a bot filling every field gets a quiet no. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class ListApplicationsQueryDto {
  /** PENDING unless asked. */
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;
}

export class ApproveApplicationDto {
  /** The new operator's short name, e.g. "volta-star". */
  @Matches(SLUG, {
    message: 'slug must be lowercase letters, digits and dashes',
  })
  @MaxLength(60)
  slug: string;
}

export class DeclineApplicationDto {
  /** Sent to the applicant, if given. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
