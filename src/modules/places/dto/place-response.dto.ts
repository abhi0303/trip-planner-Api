import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlaceCategory, TravelStyle } from '@prisma/client';

export class PlaceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'cola-beach-goa' })
  slug: string;

  @ApiProperty({ example: 'Cola Beach' })
  name: string;

  @ApiProperty({ example: 'IN' })
  countryCode: string;

  @ApiProperty({ example: 'India' })
  country: string;

  @ApiPropertyOptional({ nullable: true, example: 'Goa' })
  state: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'South Goa' })
  region: string | null;

  @ApiProperty({ enum: PlaceCategory })
  category: PlaceCategory;

  @ApiPropertyOptional({ nullable: true })
  coverImage: string | null;

  @ApiPropertyOptional({ nullable: true })
  latitude: number | null;

  @ApiPropertyOptional({ nullable: true })
  longitude: number | null;

  @ApiProperty({ example: 137, description: 'Published experiences at this place' })
  experienceCount: number;
}

export class CriteriaRatingDto {
  @ApiProperty({ example: 'SCENERY' })
  criteria: string;

  @ApiProperty({ example: 4.7 })
  average: number;

  @ApiProperty({ example: 42, description: 'Ratings behind this average' })
  count: number;
}

export class MonthlyDistributionDto {
  @ApiProperty({ example: 8, description: '1-12' })
  month: number;

  @ApiProperty({ example: 'August' })
  label: string;

  @ApiProperty({ example: 21 })
  experienceCount: number;
}

export class PlaceAggregatesDto {
  @ApiProperty({ example: 137 })
  experienceCount: number;

  @ApiProperty({ example: 121, description: 'Distinct travelers' })
  travelerCount: number;

  @ApiProperty({
    example: true,
    description:
      'False when fewer than MIN_SAMPLE_SIZE experiences exist — averages below are null and must not be shown as trends (spec §24).',
  })
  hasEnoughData: boolean;

  @ApiProperty({ example: 3 })
  minSampleSize: number;

  @ApiPropertyOptional({ nullable: true, example: 4.4 })
  avgRating: number | null;

  @ApiProperty({ type: [CriteriaRatingDto] })
  ratingBreakdown: CriteriaRatingDto[];

  @ApiPropertyOptional({ nullable: true, example: 240, description: 'Average visit, minutes' })
  avgVisitMinutes: number | null;

  @ApiPropertyOptional({ nullable: true, example: 18500 })
  avgSpendPerPerson: number | null;

  @ApiPropertyOptional({ nullable: true, example: 4 })
  avgTripDays: number | null;

  @ApiProperty({ enum: TravelStyle, isArray: true, example: ['COUPLE', 'BEACH', 'PHOTOGRAPHY'] })
  popularTravelStyles: TravelStyle[];

  @ApiProperty({ type: [MonthlyDistributionDto], description: 'Experiences by month (spec §30)' })
  monthlyDistribution: MonthlyDistributionDto[];

  @ApiProperty({ type: [PlaceSummaryDto], description: 'Places most often combined with this one' })
  frequentlyPairedWith: PlaceSummaryDto[];
}

export class PlaceDetailDto extends PlaceSummaryDto {
  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  city: string | null;

  @ApiProperty()
  isVerified: boolean;

  @ApiPropertyOptional({ type: PlaceSummaryDto, nullable: true })
  parent: PlaceSummaryDto | null;

  @ApiProperty({ type: PlaceAggregatesDto })
  aggregates: PlaceAggregatesDto;

  @ApiProperty({
    type: [Object],
    description: 'Recent reality checks reported at this place (spec §16)',
  })
  realityChecks: { id: string; severity: string; text: string; createdAt: Date }[];
}
