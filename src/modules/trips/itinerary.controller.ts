import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrorResponses,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { MessageDto } from 'src/common/dto/message.dto';
import { TripActivityDto, TripDayDto } from './dto/trip-response.dto';
import {
  CreateActivityDto,
  ReorderActivitiesDto,
  UpdateActivityDto,
  UpsertTripDayDto,
} from './dto/trip-sections.dto';
import { ItineraryService } from './itinerary.service';

@ApiTags('Itinerary')
@Controller('trips/:tripId/itinerary')
export class ItineraryController {
  constructor(private readonly itinerary: ItineraryService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Day-by-day itinerary',
    description: 'Same visibility rules as the trip itself (spec §27).',
  })
  @ApiEnvelope(TripDayDto, { isArray: true })
  @ApiErrorResponses(404)
  list(@Param('tripId', ParseUUIDPipe) tripId: string, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.itinerary.list(tripId, viewer?.id);
  }

  @Put('days')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create or update a day',
    description: 'Addressed by dayNumber; the date is derived from the trip start date.',
  })
  @ApiEnvelope(TripDayDto)
  @ApiErrorResponses(400, 401, 403, 404)
  upsertDay(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertTripDayDto,
  ) {
    return this.itinerary.upsertDay(tripId, user.id, dto);
  }

  @Delete('days/:dayNumber')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a day and its activities' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  removeDay(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('dayNumber', ParseIntPipe) dayNumber: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.itinerary.removeDay(tripId, dayNumber, user.id);
  }

  @Post('days/:dayNumber/activities')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add an activity to a day',
    description: 'The day is created automatically if it does not exist yet.',
  })
  @ApiEnvelope(TripActivityDto, { status: 201 })
  @ApiErrorResponses(400, 401, 403, 404)
  addActivity(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('dayNumber', ParseIntPipe) dayNumber: number,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateActivityDto,
  ) {
    return this.itinerary.addActivity(tripId, dayNumber, user.id, dto);
  }

  @Put('days/:dayNumber/activities/order')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reorder activities within a day',
    description: 'Send every activity id on that day in the new order (drag and drop).',
  })
  @ApiEnvelope(TripActivityDto, { isArray: true })
  @ApiErrorResponses(400, 401, 403, 404)
  reorder(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('dayNumber', ParseIntPipe) dayNumber: number,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderActivitiesDto,
  ) {
    return this.itinerary.reorderActivities(tripId, dayNumber, user.id, dto);
  }

  @Patch('activities/:activityId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an activity' })
  @ApiEnvelope(TripActivityDto)
  @ApiErrorResponses(400, 401, 403, 404)
  updateActivity(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.itinerary.updateActivity(tripId, activityId, user.id, dto);
  }

  @Delete('activities/:activityId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an activity' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  removeActivity(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.itinerary.removeActivity(tripId, activityId, user.id);
  }
}
