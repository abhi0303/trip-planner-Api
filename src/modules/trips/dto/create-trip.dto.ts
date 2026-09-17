import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CrowdLevel, ExpenseMode, TravelStyle, Visibility, Weather } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from 'src/common/constants';

/**
 * Step 1-3 of the wizard (spec §41). Everything past step 3 is added through
 * PATCH /trips/:id and the sub-resource endpoints, so a draft can be saved at
 * any point.
 */
export class CreateTripDto {
  @ApiProperty({ example: 'My South Goa Experience' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'IN', description: 'ISO 3166-1 alpha-2' })
  @IsString()
  @Length(2, 2)
  @Transform(({ value }) => String(value).trim().toUpperCase())
  countryCode: string;

  @ApiProperty({ example: 'India' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiPropertyOptional({ example: 'Goa' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @ApiProperty({ example: 'South Goa', description: 'Free-text label shown on the trip card' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  destination: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Canonical place for the destination. Strongly recommended — it powers discovery.',
  })
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @ApiProperty({ example: '2026-08-12', format: 'date' })
  @IsDateString({ strict: false }, { message: 'startDate must be an ISO date (YYYY-MM-DD)' })
  startDate: string;

  @ApiProperty({
    example: '2026-08-15',
    format: 'date',
    description: 'Must be on or after startDate. nights/days are derived server-side.',
  })
  @IsDateString({ strict: false }, { message: 'endDate must be an ISO date (YYYY-MM-DD)' })
  endDate: string;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 50, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  adults?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 50, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  children?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 20, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  infants?: number;

  @ApiPropertyOptional({
    enum: ExpenseMode,
    default: ExpenseMode.TOTAL,
    description: 'TOTAL = one number; DETAILED = per-category line items (spec §8)',
  })
  @IsOptional()
  @IsEnum(ExpenseMode)
  expenseMode?: ExpenseMode;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Required when expenseMode is TOTAL. Ignored when DETAILED (derived from items).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalExpense?: number;

  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES, default: 'INR' })
  @IsOptional()
  @IsIn([...SUPPORTED_CURRENCIES])
  currency?: string;

  @ApiPropertyOptional({ enum: TravelStyle, isArray: true, example: ['COUPLE', 'BEACH'] })
  @IsOptional()
  @IsArray()
  @IsEnum(TravelStyle, { each: true })
  @ArrayMaxSize(8)
  travelStyles?: TravelStyle[];

  @ApiPropertyOptional({ enum: Weather })
  @IsOptional()
  @IsEnum(Weather)
  weather?: Weather;

  @ApiPropertyOptional({ enum: CrowdLevel })
  @IsOptional()
  @IsEnum(CrowdLevel)
  crowdLevel?: CrowdLevel;

  @ApiPropertyOptional({
    enum: Visibility,
    default: Visibility.PUBLIC,
    description: 'FRIENDS means mutual follow',
  })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({
    enum: Visibility,
    default: Visibility.PUBLIC,
    description: 'Hide spending while keeping the trip public (spec §33)',
  })
  @IsOptional()
  @IsEnum(Visibility)
  expenseVisibility?: Visibility;

  // --- Experience prompts (spec §13) ------------------------------------

  @ApiPropertyOptional({ maxLength: 8000, description: 'Overall experience' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  experience?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'What did you enjoy?' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  enjoyedMost?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'What surprised you?' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  surprisedBy?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'What went wrong?' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  wentWrong?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'What would you do differently?' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  wouldDoDifferently?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'What should another traveler know?' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adviceForTravelers?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Media id used as the cover photo' })
  @IsOptional()
  @IsUUID()
  coverMediaId?: string;
}
