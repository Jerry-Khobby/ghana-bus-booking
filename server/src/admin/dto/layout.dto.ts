import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CellType } from '../../generated/prisma/enums.js';

export class LayoutCellDto {
  @IsInt()
  @Min(0)
  r: number;

  @IsInt()
  @Min(0)
  c: number;

  @IsEnum(CellType)
  type: CellType;

  /** SEAT cells only, e.g. "14". */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  label?: string;
}

/** What the layout editor saves. */
export class LayoutDto {
  @IsString()
  @Length(1, 60)
  name: string;

  @IsInt()
  @Min(1)
  @Max(20)
  rows: number;

  @IsInt()
  @Min(1)
  @Max(8)
  cols: number;

  @IsArray()
  @ArrayMaxSize(160)
  @ValidateNested({ each: true })
  @Type(() => LayoutCellDto)
  cells: LayoutCellDto[];
}
