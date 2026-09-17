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
import { ReportTargetType, UserRole, UserStatus } from '@prisma/client';
import {
  ApiEnvelope,
  ApiErrorResponses,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from 'src/common/decorators';
import { MessageDto } from 'src/common/dto/message.dto';
import {
  BlockUserDto,
  CreateReportDto,
  ReportQueryDto,
  ResolveReportDto,
} from './dto/moderation.dto';
import { ModerationService } from './moderation.service';

@ApiTags('Moderation')
@ApiBearerAuth()
@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('reports')
  @ApiOperation({
    summary: 'Report a user, trip, post or comment',
    description: 'Reporting the same target twice is a no-op.',
  })
  @ApiEnvelope(MessageDto, { status: 201 })
  @ApiErrorResponses(400, 401, 404)
  report(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReportDto) {
    return this.moderation.report(user.id, dto);
  }

  @Post('users/:userId/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Block a user',
    description: 'Hides content in both directions and removes any follow relationship.',
  })
  @ApiEnvelope(Object)
  @ApiErrorResponses(400, 401, 404)
  block(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BlockUserDto,
  ) {
    return this.moderation.block(user.id, userId, dto);
  }

  @Delete('users/:userId/block')
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiEnvelope(Object)
  @ApiErrorResponses(401)
  unblock(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.moderation.unblock(user.id, userId);
  }

  @Get('users/me/blocked')
  @ApiOperation({ summary: 'Users you have blocked' })
  @ApiEnvelope(Object, { isArray: true })
  @ApiErrorResponses(401)
  blocked(@CurrentUser() user: AuthenticatedUser) {
    return this.moderation.listBlocked(user.id);
  }

  // --- Admin ---------------------------------------------------------------

  @Get('admin/reports')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Moderation queue', description: 'Admin and moderator only.' })
  @ApiPaginatedEnvelope(Object)
  @ApiErrorResponses(401, 403)
  reports(@Query() query: ReportQueryDto) {
    return this.moderation.listReports(query);
  }

  @Patch('admin/reports/:id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Resolve a report' })
  @ApiEnvelope(Object)
  @ApiErrorResponses(401, 403, 404)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ResolveReportDto,
  ) {
    return this.moderation.resolveReport(id, admin.id, dto);
  }

  @Patch('admin/users/:userId/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Suspend or reinstate a user',
    description: 'Suspending revokes every session immediately.',
  })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  setStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('status') status: UserStatus,
  ) {
    return this.moderation.setUserStatus(userId, status);
  }

  @Delete('admin/content/:targetType/:targetId')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Take down content', description: 'Soft delete — restorable.' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(400, 401, 403, 404)
  removeContent(
    @Param('targetType') targetType: ReportTargetType,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.moderation.removeContent(targetType, targetId);
  }
}
