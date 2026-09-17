import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

/** Compact author block embedded in posts, trips and comments. */
export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'sreyanse' })
  username: string;

  @ApiProperty({ example: 'Sreyanse Pradhan' })
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  profileImage: string | null;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Whether the viewer follows this user. null for anonymous callers.',
    nullable: true,
  })
  isFollowing?: boolean | null;
}

export class UserStatsDto {
  @ApiProperty({ example: 12, description: 'Published trips visible to the viewer' })
  trips: number;

  @ApiProperty({ example: 48, description: 'Distinct canonical places visited' })
  placesVisited: number;

  @ApiProperty({ example: 3 })
  countries: number;

  @ApiProperty({ example: 342 })
  followers: number;

  @ApiProperty({ example: 187 })
  following: number;

  @ApiProperty({ example: 26 })
  posts: number;
}

export class UserProfileDto extends UserSummaryDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Only present on your own profile',
  })
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bio: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  coverImage: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'IN' })
  homeCountry: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Bengaluru' })
  homeCity: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  websiteUrl: string | null;

  @ApiProperty({ example: 'INR', description: 'Preferred display currency' })
  currency: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, description: 'Only present on your own profile' })
  status?: UserStatus;

  @ApiProperty({ type: UserStatsDto })
  stats: UserStatsDto;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Does this user follow the viewer?',
    nullable: true,
  })
  isFollowedBy?: boolean | null;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Has the viewer blocked this user?',
    nullable: true,
  })
  isBlocked?: boolean | null;

  @ApiProperty({ example: true, description: 'Is this the viewer’s own profile?' })
  isSelf: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

/** One pin on the profile travel map (spec §32). */
export class TravelMapEntryDto {
  @ApiProperty({ example: 'IN' })
  countryCode: string;

  @ApiProperty({ example: 'India' })
  country: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Goa' })
  state: string | null;

  @ApiProperty({ example: 3 })
  tripCount: number;

  @ApiProperty({ example: 12 })
  placeCount: number;

  @ApiPropertyOptional({ type: Date, nullable: true, format: 'date' })
  lastVisitedAt: Date | null;
}
