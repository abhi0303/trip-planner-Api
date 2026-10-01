import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlaceCategory, TripStatus, UserRole, UserStatus, Visibility } from '@prisma/client';
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
import { OffsetPaginationDto } from 'src/common/dto/pagination.dto';

const asBoolean = () =>
  Transform(({ value }) => value === true || value === 'true' || value === '1');

// --- queries ---------------------------------------------------------------

export class AdminUserQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ description: 'Matches username, name or email' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class AdminTripQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ description: 'Matches title or destination' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({ enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class AdminPlaceQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ description: 'Matches name, state, region or city' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Only places with no latitude/longitude' })
  @IsOptional()
  @asBoolean()
  @IsBoolean()
  missingCoordinates?: boolean;

  @ApiPropertyOptional({ description: 'Only places nobody has verified' })
  @IsOptional()
  @asBoolean()
  @IsBoolean()
  unverified?: boolean;

  @ApiPropertyOptional({
    description: 'Only places nothing references — candidates for deletion',
  })
  @IsOptional()
  @asBoolean()
  @IsBoolean()
  orphaned?: boolean;
}

// --- mutations -------------------------------------------------------------

export class ChangeRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ maxLength: 500, description: 'Recorded in the audit trail' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdatePlaceDto {
  @ApiPropertyOptional({ example: 'Palolem Beach' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: PlaceCategory })
  @IsOptional()
  @IsEnum(PlaceCategory)
  category?: PlaceCategory;

  @ApiPropertyOptional({ example: 'Goa' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @ApiPropertyOptional({ example: 'South Goa' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @ApiPropertyOptional({ example: 'Canacona' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ example: 15.0099 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 74.0233 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Pickable as a trip destination' })
  @IsOptional()
  @IsBoolean()
  isDestination?: boolean;

  @ApiPropertyOptional({ description: 'Checked by a human' })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ example: 'IN', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Transform(({ value }) => String(value).trim().toUpperCase())
  countryCode?: string;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;
}

export class MergePlaceDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The place to keep. Everything pointing at the source moves here.',
  })
  @IsUUID()
  targetId: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Recorded in the audit trail' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
