import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlaceCategory } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { CursorPaginationDto, OffsetPaginationDto } from 'src/common/dto/pagination.dto';

export class CreatePlaceDto {
  @ApiProperty({ example: 'Cola Beach' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

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
  state?: string;

  @ApiPropertyOptional({ example: 'South Goa' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 'Canacona' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 15.0439 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 74.0186 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ enum: PlaceCategory, default: PlaceCategory.OTHER })
  @IsOptional()
  @IsEnum(PlaceCategory)
  category?: PlaceCategory;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Parent destination, e.g. Cola Beach → South Goa',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({
    description: 'True for destinations users pick in the trip wizard (South Goa), not POIs',
  })
  @IsOptional()
  @IsBoolean()
  isDestination?: boolean;
}

export class SearchPlacesDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ example: 'cola', description: 'Free-text, matches name and region' })
  @IsOptional()
  @IsString()
  q?: string;

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

  @ApiPropertyOptional({ enum: PlaceCategory })
  @IsOptional()
  @IsEnum(PlaceCategory)
  category?: PlaceCategory;

  @ApiPropertyOptional({ description: 'Only trip-wizard destinations' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  destinationsOnly?: boolean;
}

export class PlaceExperiencesQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Filter to trips that started in this month (1-12) — seasonal view (spec §30)',
    minimum: 1,
    maximum: 12,
  })
  @IsOptional()
  @Type(() => Number)
  month?: number;
}
