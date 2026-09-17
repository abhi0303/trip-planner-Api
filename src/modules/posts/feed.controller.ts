import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { PostDto } from './dto/post-response.dto';
import { FeedQueryDto } from './dto/post.dto';
import { PostsService } from './posts.service';

@ApiTags('Feed')
@Controller('feed')
export class FeedController {
  constructor(private readonly posts: PostsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Home feed',
    description:
      'type=for-you works signed out. type=following and type=friends need a token (spec §42).',
  })
  @ApiPaginatedEnvelope(PostDto)
  @ApiErrorResponses(403)
  feed(@Query() query: FeedQueryDto, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.posts.feed(query, viewer?.id);
  }
}
