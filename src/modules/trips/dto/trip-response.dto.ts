import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CrowdLevel,
  ExpenseCategory,
  ExpenseMode,
  RatingType,
  Season,
  TravelStyle,
  TripStatus,
  Visibility,
  Weather,
} from '@prisma/client';
import { UserSummaryDto } from 'src/modules/users/dto/user-response.dto';
import { PlaceSummaryDto } from 'src/modules/places/dto/place-response.dto';

export class MediaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  url: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnailUrl: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  blurhash?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  width?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  height?: number | null;
}

export class CategoryBreakdownDto {
  @ApiProperty({ enum: ExpenseCategory })
  category: ExpenseCategory;

  @ApiProperty({ example: 20000 })
  amount: number;

  @ApiProperty({ example: 40, description: 'Share of the trip total, percent' })
  percentage: number;

  @ApiProperty({
    type: [Object],
    example: [{ subcategory: 'FLIGHT', amount: 16000 }],
  })
  subcategories: { subcategory: string; amount: number }[];
}

/** Expense intelligence (spec §9). Null when the viewer may not see spending. */
export class ExpenseSummaryDto {
  @ApiProperty({ enum: ExpenseMode })
  mode: ExpenseMode;

  @ApiProperty({ example: 'INR' })
  currency: string;

  @ApiProperty({ example: 50000 })
  total: number;

  @ApiProperty({ example: 25000 })
  perPerson: number;

  @ApiProperty({ example: 12500 })
  perDay: number;

  @ApiProperty({ example: 6250 })
  perPersonPerDay: number;

  @ApiProperty({ example: 2 })
  travelerCount: number;

  @ApiProperty({ example: 4 })
  days: number;

  @ApiProperty({ type: [CategoryBreakdownDto] })
  byCategory: CategoryBreakdownDto[];
}

export class TripPlaceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: PlaceSummaryDto })
  place: PlaceSummaryDto;

  @ApiPropertyOptional({ type: Date, nullable: true, format: 'date' })
  visitDate: Date | null;

  @ApiProperty({ example: 0 })
  sequence: number;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 240 })
  durationMinutes: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  notes: string | null;
}

export class TripStayDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Monsoon Agonda' })
  hotelName: string;

  @ApiPropertyOptional({ type: PlaceSummaryDto, nullable: true })
  place: PlaceSummaryDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  location: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true, format: 'date' })
  checkIn: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true, format: 'date' })
  checkOut: Date | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  nights: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'null when the trip’s expense visibility hides spending',
  })
  amount: number | null;

  @ApiProperty()
  currency: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  roomType: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  rating: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bookingPlatform: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  websiteUrl: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  notes: string | null;
}

export class TripPhotoDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: MediaDto })
  media: MediaDto;

  @ApiPropertyOptional({ type: PlaceSummaryDto, nullable: true })
  place: PlaceSummaryDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  caption: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true, format: 'date-time' })
  takenAt: Date | null;

  @ApiProperty()
  sequence: number;

  @ApiProperty({
    description:
      'True for the one photo used as the trip cover. Exactly one photo has this set while the trip has any photos.',
    example: false,
  })
  isCover: boolean;
}

export class RatingGroupDto {
  @ApiProperty({ enum: RatingType })
  ratingType: RatingType;

  @ApiPropertyOptional({ type: PlaceSummaryDto, nullable: true })
  place: PlaceSummaryDto | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  stayId: string | null;

  @ApiProperty({ example: { SCENERY: 5, CROWD: 4 }, description: 'criteria → score' })
  scores: Record<string, number>;

  @ApiProperty({ example: 4.5, description: 'Mean of the scores in this group' })
  average: number;
}

export class RealityCheckDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'WARNING' })
  severity: string;

  @ApiProperty()
  text: string;

  @ApiPropertyOptional({ type: PlaceSummaryDto, nullable: true })
  place?: PlaceSummaryDto | null;
}

export class TripActivityDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ example: 'SIGHTSEEING' })
  kind: string;

  @ApiPropertyOptional({ type: PlaceSummaryDto, nullable: true })
  place: PlaceSummaryDto | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '09:30' })
  startTime: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '12:00' })
  endTime: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty()
  sequence: number;
}

export class TripDayDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 1 })
  dayNumber: number;

  @ApiPropertyOptional({ type: Date, nullable: true, format: 'date' })
  date: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  title: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  summary: string | null;

  @ApiProperty({ type: [TripActivityDto] })
  activities: TripActivityDto[];
}

/** The compact shape used in feeds, search results and profile grids. */
export class TripCardDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ example: 'My South Goa Experience' })
  title: string;

  @ApiProperty({ example: 'India' })
  country: string;

  @ApiProperty({ example: 'IN' })
  countryCode: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Goa' })
  state: string | null;

  @ApiProperty({ example: 'South Goa' })
  destination: string;

  @ApiProperty({ format: 'date' })
  startDate: Date;

  @ApiProperty({ format: 'date' })
  endDate: Date;

  @ApiProperty({ example: 3 })
  nights: number;

  @ApiProperty({ example: 4 })
  days: number;

  @ApiProperty({ example: 2 })
  travelerCount: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 50000,
    description: 'null when expenses are hidden from the viewer',
  })
  totalExpense: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 25000,
    description: 'null when expenses are hidden from the viewer',
  })
  perPerson: number | null;

  @ApiProperty({ example: 'INR' })
  currency: string;

  @ApiProperty({ enum: TravelStyle, isArray: true })
  travelStyles: TravelStyle[];

  @ApiPropertyOptional({ enum: Season, nullable: true })
  season: Season | null;

  @ApiProperty({ example: 4 })
  placeCount: number;

  @ApiProperty({ example: 15 })
  photoCount: number;

  @ApiProperty({ example: 42 })
  saveCount: number;

  @ApiProperty({ enum: Visibility })
  visibility: Visibility;

  @ApiProperty({ type: UserSummaryDto })
  user: UserSummaryDto;

  @ApiPropertyOptional({ type: MediaDto, nullable: true })
  coverMedia: MediaDto | null;

  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'Has the viewer saved this trip?',
  })
  isSaved?: boolean | null;

  @ApiPropertyOptional({ type: Date, nullable: true, format: 'date-time' })
  publishedAt: Date | null;
}

export class TripDetailDto extends TripCardDto {
  @ApiProperty({ enum: TripStatus })
  status: TripStatus;

  @ApiProperty({ enum: Visibility })
  expenseVisibility: Visibility;

  @ApiProperty({ example: 2 })
  adults: number;

  @ApiProperty({ example: 0 })
  children: number;

  @ApiProperty({ example: 0 })
  infants: number;

  @ApiPropertyOptional({ enum: Weather, nullable: true })
  weather: Weather | null;

  @ApiPropertyOptional({ enum: CrowdLevel, nullable: true })
  crowdLevel: CrowdLevel | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  experience: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  enjoyedMost: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  surprisedBy: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  wentWrong: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  wouldDoDifferently: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  adviceForTravelers: string | null;

  @ApiPropertyOptional({
    type: ExpenseSummaryDto,
    nullable: true,
    description: 'null when expenseVisibility hides spending from the viewer',
  })
  expenses: ExpenseSummaryDto | null;

  @ApiProperty({ type: [TripPlaceDto], description: 'Ordered by route sequence' })
  places: TripPlaceDto[];

  @ApiProperty({ type: [TripStayDto] })
  stays: TripStayDto[];

  @ApiProperty({ type: [TripPhotoDto] })
  photos: TripPhotoDto[];

  @ApiProperty({ type: [RatingGroupDto] })
  ratings: RatingGroupDto[];

  @ApiProperty({ type: [RealityCheckDto] })
  realityChecks: RealityCheckDto[];

  @ApiProperty({ type: [TripDayDto], description: 'Itinerary; empty when not filled in' })
  itinerary: TripDayDto[];

  @ApiProperty({ example: 1240 })
  viewCount: number;

  @ApiProperty({ example: true, description: 'Is the viewer the author?' })
  isOwner: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
