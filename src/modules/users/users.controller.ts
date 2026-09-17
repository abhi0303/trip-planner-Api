import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrorResponses,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { MessageDto } from 'src/common/dto/message.dto';
import { CursorPaginationDto } from 'src/common/dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  TravelMapEntryDto,
  UserProfileDto,
  UserSummaryDto,
} from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update your own profile' })
  @ApiEnvelope(UserProfileDto)
  @ApiErrorResponses(400, 401)
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.users.update(user.id, dto);
  }

  @Delete('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Deactivate your account',
    description: 'Soft delete: content is hidden and all sessions are revoked.',
  })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401)
  deactivate(@CurrentUser() user: AuthenticatedUser) {
    return this.users.deactivate(user.id);
  }

  @Public()
  @Get(':idOrUsername')
  @ApiOperation({
    summary: 'Public profile',
    description: 'Accepts a uuid or a username. Counters respect the viewer’s visibility.',
  })
  @ApiParam({ name: 'idOrUsername', example: 'sreyanse' })
  @ApiEnvelope(UserProfileDto)
  @ApiErrorResponses(404)
  getOne(@Param('idOrUsername') idOrUsername: string, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.users.getProfile(idOrUsername, viewer?.id);
  }

  @Post(':idOrUsername/follow')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Follow a user', description: 'Idempotent.' })
  @ApiEnvelope(Object, { description: '{ following: true }' })
  @ApiErrorResponses(400, 401, 403, 404)
  follow(@CurrentUser() user: AuthenticatedUser, @Param('idOrUsername') target: string) {
    return this.users.follow(user.id, target);
  }

  @Delete(':idOrUsername/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unfollow a user', description: 'Idempotent.' })
  @ApiEnvelope(Object, { description: '{ following: false }' })
  @ApiErrorResponses(401, 404)
  unfollow(@CurrentUser() user: AuthenticatedUser, @Param('idOrUsername') target: string) {
    return this.users.unfollow(user.id, target);
  }

  @Public()
  @Get(':idOrUsername/followers')
  @ApiOperation({ summary: 'Followers of a user' })
  @ApiPaginatedEnvelope(UserSummaryDto)
  @ApiErrorResponses(404)
  followers(
    @Param('idOrUsername') idOrUsername: string,
    @Query() query: CursorPaginationDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.users.listFollowers(idOrUsername, query, viewer?.id);
  }

  @Public()
  @Get(':idOrUsername/following')
  @ApiOperation({ summary: 'Users this user follows' })
  @ApiPaginatedEnvelope(UserSummaryDto)
  @ApiErrorResponses(404)
  following(
    @Param('idOrUsername') idOrUsername: string,
    @Query() query: CursorPaginationDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.users.listFollowing(idOrUsername, query, viewer?.id);
  }

  @Public()
  @Get(':idOrUsername/travel-map')
  @ApiOperation({
    summary: 'Travel map pins',
    description: 'One entry per country/state with trip and place counts (spec §32).',
  })
  @ApiEnvelope(TravelMapEntryDto, { isArray: true })
  @ApiErrorResponses(404)
  travelMap(@Param('idOrUsername') idOrUsername: string, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.users.travelMap(idOrUsername, viewer?.id);
  }
}
