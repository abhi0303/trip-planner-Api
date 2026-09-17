import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Visibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CursorPaginationDto } from 'src/common/dto/pagination.dto';

export class CreatePostDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Trip this post is shared from. Strongly recommended (spec §5).',
  })
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Narrow the post to one place, e.g. "My experience at Cola Beach"',
  })
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Media ids in carousel order. Falls back to the trip cover when omitted.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(20)
  mediaIds?: string[];

  @ApiPropertyOptional({ enum: Visibility, default: Visibility.PUBLIC })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}

export class UpdatePostDto {
  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}

export class CreateCommentDto {
  @ApiProperty({ example: 'How was the road to Cola in August?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  body: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Reply to a top-level comment' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class SavePostDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'File the save into a collection, e.g. "Goa Plans" (spec §21)',
  })
  @IsOptional()
  @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export type FeedType = 'for-you' | 'following' | 'friends';

export class FeedQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    enum: ['for-you', 'following', 'friends'],
    default: 'for-you',
    description:
      'for-you = recent + popular public posts; following = people you follow; friends = mutual follows only',
  })
  @IsOptional()
  @IsEnum(['for-you', 'following', 'friends'] as any)
  type?: FeedType = 'for-you';
}

export class PostQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tripId?: string;
}

export class CreateCollectionDto {
  @ApiProperty({ example: 'Goa Plans' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ example: '🏖️' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  isPrivate?: boolean;
}
