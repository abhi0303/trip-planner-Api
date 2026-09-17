import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrorResponses,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { MessageDto } from 'src/common/dto/message.dto';
import { CommentDto, PostDto, ToggleResultDto } from './dto/post-response.dto';
import {
  CreateCommentDto,
  CreatePostDto,
  PostQueryDto,
  SavePostDto,
  UpdatePostDto,
} from './dto/post.dto';
import { PostsService } from './posts.service';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Share a post',
    description:
      'A post is something shared from a trip (spec §5). Link it with tripId — the feed card then shows the trip’s cost, duration and place count.',
  })
  @ApiEnvelope(PostDto, { status: 201 })
  @ApiErrorResponses(400, 401, 403, 404)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostDto) {
    return this.posts.create(user.id, dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List posts', description: 'Filter by author, trip or place.' })
  @ApiPaginatedEnvelope(PostDto)
  list(@Query() query: PostQueryDto, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.posts.list(query, viewer?.id);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Single post' })
  @ApiEnvelope(PostDto)
  @ApiErrorResponses(404)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.posts.findOne(id, viewer?.id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit caption or visibility' })
  @ApiEnvelope(PostDto)
  @ApiErrorResponses(401, 403, 404)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a post' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.remove(id, user.id);
  }

  // --- Engagement -----------------------------------------------------------

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like a post', description: 'Idempotent.' })
  @ApiEnvelope(ToggleResultDto)
  @ApiErrorResponses(401, 404)
  like(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.like(id, user.id);
  }

  @Delete(':id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a like', description: 'Idempotent.' })
  @ApiEnvelope(ToggleResultDto)
  @ApiErrorResponses(401, 404)
  unlike(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.unlike(id, user.id);
  }

  @Post(':id/save')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Save a post',
    description: 'Pass collectionId to file it into a collection. Re-saving moves it.',
  })
  @ApiEnvelope(ToggleResultDto)
  @ApiErrorResponses(401, 404)
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SavePostDto,
  ) {
    return this.posts.save(id, user.id, dto);
  }

  @Delete(':id/save')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a save' })
  @ApiEnvelope(ToggleResultDto)
  @ApiErrorResponses(401, 404)
  unsave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.unsave(id, user.id);
  }

  @Public()
  @Post(':id/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a share', description: 'Increments the share counter.' })
  @ApiEnvelope(Object)
  @ApiErrorResponses(404)
  share(@Param('id', ParseUUIDPipe) id: string) {
    return this.posts.share(id);
  }

  // --- Comments -------------------------------------------------------------

  @Public()
  @Get(':id/comments')
  @ApiOperation({ summary: 'Top-level comments', description: 'Replies load per thread.' })
  @ApiPaginatedEnvelope(CommentDto)
  @ApiErrorResponses(404)
  comments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PostQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.posts.listComments(id, query, viewer?.id);
  }

  @Post(':id/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a comment or reply' })
  @ApiEnvelope(CommentDto, { status: 201 })
  @ApiErrorResponses(400, 401, 404)
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.posts.addComment(id, user.id, dto);
  }

  @Public()
  @Get('comments/:commentId/replies')
  @ApiOperation({ summary: 'Replies to a comment' })
  @ApiPaginatedEnvelope(CommentDto)
  replies(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Query() query: PostQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.posts.listReplies(commentId, query, viewer?.id);
  }

  @Delete('comments/:commentId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a comment',
    description: 'Allowed for the comment author and the post author.',
  })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  removeComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posts.removeComment(commentId, user.id);
  }
}
