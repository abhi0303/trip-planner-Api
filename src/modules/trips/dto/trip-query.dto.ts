import { ApiPropertyOptional } from '@nestjs/swagger';
import { Season, TravelStyle, TripStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { CursorPaginationDto } from 'src/common/dto/pagination.dto';

export const TRIP_SORTS = ['recent', 'oldest', 'popular', 'budget_low', 'budget_high'] as const;
export type TripSort = (typeof TRIP_SORTS)[number];

/**
 * Discovery filters. Together these cover the Budget Explorer (spec §31) and
 * the "similar travelers" query (spec §25).
 */
export class TripQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Trips by one author' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: 'IN' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Transform(({ value }) => String(value).trim().toUpperCase())
  countryCode?: string;

  @ApiPropertyOptional({ example: 'Goa' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Canonical destination id' })
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Trips that visited this place' })
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: TravelStyle,
    description: 'Repeat the param or send a comma-separated list. Matches any of them.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim().toUpperCase()),
  )
  @IsEnum(TravelStyle, { each: true })
  travelStyles?: TravelStyle[];

  @ApiPropertyOptional({ example: 20000, description: 'Minimum total spend' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBudget?: number;

  @ApiPropertyOptional({ example: 30000, description: 'Maximum total spend' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBudget?: number;

  @ApiPropertyOptional({ example: 3, description: 'Minimum trip length in days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minDays?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDays?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  travelerCount?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, description: 'Trips that started in this month' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ enum: Season })
  @IsOptional()
  @IsEnum(Season)
  season?: Season;

  @ApiPropertyOptional({ enum: TRIP_SORTS, default: 'recent' })
  @IsOptional()
  @IsIn([...TRIP_SORTS])
  sort?: TripSort = 'recent';

  @ApiPropertyOptional({
    enum: TripStatus,
    description: 'Only honoured on GET /trips/me — drafts are never listed publicly',
  })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;
}
