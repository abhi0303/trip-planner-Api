import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ActivityKind,
  ExpenseCategory,
  RatingCriteria,
  RatingType,
  RealityCheckSeverity,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RATING_MAX, RATING_MIN } from 'src/common/constants';

// --- Places (spec §10) ------------------------------------------------------

export class AddTripPlaceDto {
  @ApiProperty({ format: 'uuid', description: 'Canonical place id from GET /places/search' })
  @IsUUID()
  placeId: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-08-13' })
  @IsOptional()
  @IsDateString({ strict: false })
  visitDate?: string;

  @ApiPropertyOptional({ description: 'Position in the route; defaults to the end of the list' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;

  @ApiPropertyOptional({ example: 240, description: 'How long you spent there, in minutes' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20160)
  durationMinutes?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateTripPlaceDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: false })
  visitDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20160)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ReorderPlacesDto {
  @ApiProperty({
    type: [String],
    description: 'TripPlace ids in their new route order (spec §11)',
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(200)
  tripPlaceIds: string[];
}

// --- Expenses (spec §8) -----------------------------------------------------

export class CreateExpenseDto {
  @ApiProperty({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @ApiPropertyOptional({
    example: 'FLIGHT',
    description: 'Must belong to the chosen category — see GET /trips/meta/expense-categories',
  })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiProperty({ example: 20000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ format: 'date', example: '2026-08-12' })
  @IsOptional()
  @IsDateString({ strict: false })
  expenseDate?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: false })
  expenseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class BulkExpensesDto {
  @ApiProperty({ type: [CreateExpenseDto], description: 'Replaces all existing line items' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  @ArrayMaxSize(200)
  expenses: CreateExpenseDto[];
}

// --- Stays (spec §12) -------------------------------------------------------

export class CreateStayDto {
  @ApiProperty({ example: 'Monsoon Agonda' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  hotelName: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Canonical place the stay sits in' })
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @ApiPropertyOptional({ example: 'Agonda Beach, Canacona' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: false })
  checkIn?: string;

  @ApiPropertyOptional({ format: 'date', description: 'nights is derived when both dates are given' })
  @IsOptional()
  @IsDateString({ strict: false })
  checkOut?: string;

  @ApiPropertyOptional({ example: 6000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: 'Sea view double' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  roomType?: string;

  @ApiPropertyOptional({ example: 4.5, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(RATING_MIN)
  @Max(RATING_MAX)
  rating?: number;

  @ApiPropertyOptional({ example: 'Booking.com' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bookingPlatform?: string;

  @ApiPropertyOptional({ example: 'https://monsoonagonda.example' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  websiteUrl?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateStayDto extends CreateStayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  declare hotelName: string;
}

// --- Photos (spec §17) ------------------------------------------------------

export class AddTripPhotoDto {
  @ApiProperty({ format: 'uuid', description: 'Media id returned by POST /media/upload' })
  @IsUUID()
  mediaId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Place this photo was taken at' })
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  caption?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  takenAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;
}

export class AddTripPhotosDto {
  @ApiProperty({ type: [AddTripPhotoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddTripPhotoDto)
  @ArrayMaxSize(100)
  photos: AddTripPhotoDto[];
}

// --- Ratings (spec §14) -----------------------------------------------------

export class RatingEntryDto {
  @ApiProperty({ enum: RatingCriteria })
  @IsEnum(RatingCriteria)
  criteria: RatingCriteria;

  @ApiProperty({ example: 5, minimum: RATING_MIN, maximum: RATING_MAX })
  @Type(() => Number)
  @IsInt()
  @Min(RATING_MIN)
  @Max(RATING_MAX)
  score: number;
}

export class SubmitRatingsDto {
  @ApiProperty({ enum: RatingType, description: 'What is being rated' })
  @IsEnum(RatingType)
  ratingType: RatingType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for PLACE ratings; omit for a TRIP rating',
  })
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for HOTEL ratings' })
  @IsOptional()
  @IsUUID()
  stayId?: string;

  @ApiProperty({
    type: [RatingEntryDto],
    description: 'Only criteria valid for this ratingType are accepted',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RatingEntryDto)
  @ArrayMaxSize(20)
  ratings: RatingEntryDto[];
}

// --- Reality checks (spec §16) ---------------------------------------------

export class CreateRealityCheckDto {
  @ApiProperty({ example: 'The road to Cola Beach is rough — avoid a sedan in monsoon.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @ApiPropertyOptional({ enum: RealityCheckSeverity, default: RealityCheckSeverity.WARNING })
  @IsOptional()
  @IsEnum(RealityCheckSeverity)
  severity?: RealityCheckSeverity;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  placeId?: string;
}

// --- Itinerary (spec §27) ---------------------------------------------------

export class UpsertTripDayDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayNumber: number;

  @ApiPropertyOptional({ example: 'Arrival and Agonda sunset' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;
}

export class CreateActivityDto {
  @ApiProperty({ example: 'Kayaking at Cola' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ enum: ActivityKind, default: ActivityKind.OTHER })
  @IsOptional()
  @IsEnum(ActivityKind)
  kind?: ActivityKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @ApiPropertyOptional({ example: '09:30', description: '24h HH:mm' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ example: '12:00', description: '24h HH:mm' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:mm' })
  endTime?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;
}

export class UpdateActivityDto extends CreateActivityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  declare title: string;
}

export class ReorderActivitiesDto {
  @ApiProperty({ type: [String], description: 'Activity ids in their new order' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(100)
  activityIds: string[];
}
