import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, Length, Matches, MaxLength } from 'class-validator';
import { SUPPORTED_CURRENCIES } from 'src/common/constants';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Sreyanse Pradhan' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'sreyanse', description: 'Must be unique' })
  @IsOptional()
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-z0-9._]+$/, {
    message: 'username may only contain lowercase letters, numbers, dot and underscore',
  })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  username?: string;

  @ApiPropertyOptional({ example: 'Beach person. 3 countries so far.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @ApiPropertyOptional({ description: 'Media URL returned by POST /media' })
  @IsOptional()
  @IsString()
  profileImage?: string;

  @ApiPropertyOptional({ description: 'Media URL returned by POST /media' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ example: 'IN', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Transform(({ value }) => String(value).trim().toUpperCase())
  homeCountry?: string;

  @ApiPropertyOptional({ example: 'Bengaluru' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  homeCity?: string;

  @ApiPropertyOptional({ example: 'https://sreyanse.travel' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  websiteUrl?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES, example: 'INR' })
  @IsOptional()
  @IsIn([...SUPPORTED_CURRENCIES])
  currency?: string;
}
