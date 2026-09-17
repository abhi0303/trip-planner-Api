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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrorResponses,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { EXPENSE_SUBCATEGORIES, RATING_CRITERIA_MATRIX } from 'src/common/constants';
import { MessageDto } from 'src/common/dto/message.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripCardDto, TripDetailDto } from './dto/trip-response.dto';
import { TripQueryDto } from './dto/trip-query.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripsService } from './trips.service';

@ApiTags('Trips')
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Public()
  @Get('meta/enums')
  @ApiOperation({
    summary: 'Enum reference',
    description:
      'Every enum value the trip endpoints accept, plus the expense subcategory and rating criteria matrices. Use this to build the wizard’s dropdowns instead of hardcoding strings.',
  })
  @ApiEnvelope(Object)
  meta() {
    return {
      expenseSubcategories: EXPENSE_SUBCATEGORIES,
      ratingCriteria: RATING_CRITERIA_MATRIX,
    };
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a trip (saved as DRAFT)',
    description:
      'Steps 1-3 of the wizard. nights, days and season are derived server-side. Everything else is added through PATCH and the sub-resource endpoints, then POST /trips/:id/publish.',
  })
  @ApiEnvelope(TripDetailDto, { status: 201 })
  @ApiErrorResponses(400, 401)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTripDto) {
    return this.trips.create(user.id, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Your own trips, drafts included',
    description: 'Filter with ?status=DRAFT to build the "continue your draft" list.',
  })
  @ApiPaginatedEnvelope(TripCardDto)
  @ApiErrorResponses(401)
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: TripQueryDto) {
    return this.trips.listMine(user.id, query);
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Browse published trips',
    description:
      'The discovery workhorse: filter by destination, place, budget, duration, travelers, travel style, month or season. Powers Explore, the Budget Explorer (spec §31) and similar-trip lists (spec §25).',
  })
  @ApiPaginatedEnvelope(TripCardDto)
  list(@Query() query: TripQueryDto, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.trips.list(query, viewer?.id);
  }

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({
    summary: 'Full trip experience',
    description:
      'Places, expenses, stays, photos, ratings, reality checks and itinerary in one response. Expense fields are null when the author hid their spending from you.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'Trip uuid or slug' })
  @ApiEnvelope(TripDetailDto)
  @ApiErrorResponses(404)
  async findOne(@Param('idOrSlug') idOrSlug: string, @CurrentUser() viewer?: AuthenticatedUser) {
    const trip = await this.trips.findOne(idOrSlug, viewer?.id);
    void this.trips.recordView(trip.id, viewer?.id);
    return trip;
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a trip',
    description: 'Send only the fields that changed — one call per wizard step is fine.',
  })
  @ApiEnvelope(TripDetailDto)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTripDto,
  ) {
    return this.trips.update(id, user.id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publish a draft',
    description:
      'Validates that the trip has at least one place and an expense figure. Returns 400 with error.details.problems listing what is missing.',
  })
  @ApiEnvelope(TripDetailDto)
  @ApiErrorResponses(400, 401, 403, 404)
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.trips.publish(id, user.id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Move a published trip back to draft' })
  @ApiEnvelope(TripDetailDto)
  @ApiErrorResponses(401, 403, 404)
  unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.trips.unpublish(id, user.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a trip', description: 'Soft delete — recoverable by support.' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.trips.remove(id, user.id);
  }
}
