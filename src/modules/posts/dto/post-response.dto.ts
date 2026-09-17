import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Visibility } from '@prisma/client';
import { MediaDto, TripCardDto } from 'src/modules/trips/dto/trip-response.dto';
import { PlaceSummaryDto } from 'src/modules/places/dto/place-response.dto';
import { UserSummaryDto } from 'src/modules/users/dto/user-response.dto';

export class PostDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: UserSummaryDto })
  user: UserSummaryDto;

  @ApiPropertyOptional({ nullable: true })
  caption: string | null;

  @ApiProperty({ type: [MediaDto], description: 'Carousel, in order' })
  media: MediaDto[];

  @ApiPropertyOptional({
    type: TripCardDto,
    nullable: true,
    description: 'The trip this post came from — supplies the stats on the feed card (spec §19)',
  })
  trip: TripCardDto | null;

  @ApiPropertyOptional({ type: PlaceSummaryDto, nullable: true })
  place: PlaceSummaryDto | null;

  @ApiProperty({ enum: Visibility })
  visibility: Visibility;

  @ApiProperty({ example: 124 })
  likeCount: number;

  @ApiProperty({ example: 18 })
  commentCount: number;

  @ApiProperty({ example: 42 })
  saveCount: number;

  @ApiProperty({ example: 6 })
  shareCount: number;

  @ApiPropertyOptional({ nullable: true, description: 'null for anonymous viewers' })
  isLiked: boolean | null;

  @ApiPropertyOptional({ nullable: true, description: 'null for anonymous viewers' })
  isSaved: boolean | null;

  @ApiProperty({ description: 'Can the viewer edit or delete this post?' })
  isOwner: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class CommentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: UserSummaryDto })
  user: UserSummaryDto;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  parentId: string | null;

  @ApiProperty({ example: 2 })
  replyCount: number;

  @ApiProperty()
  isOwner: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class CollectionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Goa Plans' })
  name: string;

  @ApiPropertyOptional({ nullable: true, example: '🏖️' })
  emoji: string | null;

  @ApiProperty()
  isPrivate: boolean;

  @ApiProperty({ example: 4 })
  itemCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class ToggleResultDto {
  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({ example: 125, description: 'Counter after the change' })
  count: number;
}
