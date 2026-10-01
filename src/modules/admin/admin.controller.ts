import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  ApiEnvelope,
  ApiErrorResponses,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from 'src/common/decorators';
import { MessageDto } from 'src/common/dto/message.dto';
import { OffsetPaginationDto } from 'src/common/dto/pagination.dto';
import { AdminService } from './admin.service';
import {
  AdminPlaceQueryDto,
  AdminTripQueryDto,
  AdminUserQueryDto,
  ChangeRoleDto,
  MergePlaceDto,
  SetUserStatusDto,
  UpdatePlaceDto,
} from './dto/admin.dto';

/**
 * Staff-only. MODERATOR can see and tidy content; ADMIN can also change who
 * someone is and destroy catalogue rows.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Platform counters',
    description: 'Users, trips, posts, place-catalogue health and the pending report count.',
  })
  @ApiEnvelope(Object)
  @ApiErrorResponses(401, 403)
  stats() {
    return this.admin.stats();
  }

  // --- Users ---------------------------------------------------------------

  @Get('users')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Browse users', description: 'q matches username, name or email.' })
  @ApiPaginatedEnvelope(Object)
  @ApiErrorResponses(401, 403)
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'One user in full' })
  @ApiEnvelope(Object)
  @ApiErrorResponses(401, 403, 404)
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Change a role',
    description:
      'Revokes their sessions so the new permissions apply immediately. You cannot change your own role.',
  })
  @ApiEnvelope(Object)
  @ApiErrorResponses(401, 403, 404)
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.admin.changeRole(actor.id, id, dto);
  }

  @Patch('users/:id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Suspend or reinstate',
    description: 'Suspending revokes every session. You cannot suspend yourself.',
  })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.admin.setUserStatus(actor.id, id, dto);
  }

  @Delete('users/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Delete a user and everything they created',
    description:
      'Permanent. Removes their trips, posts, photos, comments, likes, saves and follows, deletes their uploaded files from storage, and repairs the counters on everyone else. You cannot delete yourself.',
  })
  @ApiEnvelope(Object)
  @ApiErrorResponses(401, 403, 404)
  deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.deleteUser(actor.id, id);
  }

  // --- Trips ---------------------------------------------------------------

  @Get('trips')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Browse every trip',
    description: 'Includes PRIVATE trips and unpublished drafts, which no public endpoint returns.',
  })
  @ApiPaginatedEnvelope(Object)
  @ApiErrorResponses(401, 403)
  listTrips(@Query() query: AdminTripQueryDto) {
    return this.admin.listTrips(query);
  }

  // --- Places --------------------------------------------------------------

  @Get('places')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Browse the place catalogue',
    description:
      'Filter by missingCoordinates, unverified or orphaned to find rows needing repair. Each row carries how many things reference it.',
  })
  @ApiPaginatedEnvelope(Object)
  @ApiErrorResponses(401, 403)
  listPlaces(@Query() query: AdminPlaceQueryDto) {
    return this.admin.listPlaces(query);
  }

  @Patch('places/:id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Fix a place',
    description: 'Correct the name, category, region or coordinates a user typed.',
  })
  @ApiEnvelope(Object)
  @ApiErrorResponses(400, 401, 403, 404)
  updatePlace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdatePlaceDto,
  ) {
    return this.admin.updatePlace(actor.id, id, dto);
  }

  @Post('places/:id/merge')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Merge a duplicate into another place',
    description:
      'Repoints every trip, stay, photo, rating and post at the target, then deletes this one. Links that would collide collapse rather than failing.',
  })
  @ApiEnvelope(Object)
  @ApiErrorResponses(400, 401, 403, 404)
  mergePlace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: MergePlaceDto,
  ) {
    return this.admin.mergePlace(actor.id, id, dto);
  }

  @Delete('places/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Delete a place',
    description:
      'Answers 409 with reference counts while anything still points at it — merging is usually what you want. ?force=true deletes it anyway, detaching it from every trip, post and stay rather than deleting them.',
  })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'Detach the place from everything instead of refusing',
  })
  @ApiEnvelope(Object)
  @ApiErrorResponses(401, 403, 404, 409)
  deletePlace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('force') force?: string,
  ) {
    return this.admin.deletePlace(actor.id, id, force === 'true');
  }

  // --- Audit ---------------------------------------------------------------

  @Get('actions')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Audit trail',
    description: 'Every role change, suspension, place edit, merge and deletion, newest first.',
  })
  @ApiPaginatedEnvelope(Object)
  @ApiErrorResponses(401, 403)
  listActions(@Query() query: OffsetPaginationDto) {
    return this.admin.listActions(query);
  }
}
