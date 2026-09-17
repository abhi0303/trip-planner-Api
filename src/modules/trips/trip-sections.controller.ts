import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { ExpensesService } from './expenses.service';
import {
  ExpenseSummaryDto,
  RealityCheckDto,
  TripPhotoDto,
  TripPlaceDto,
  TripStayDto,
} from './dto/trip-response.dto';
import {
  AddTripPhotosDto,
  AddTripPlaceDto,
  BulkExpensesDto,
  CreateExpenseDto,
  CreateRealityCheckDto,
  CreateStayDto,
  ReorderPlacesDto,
  SubmitRatingsDto,
  UpdateExpenseDto,
  UpdateStayDto,
  UpdateTripPlaceDto,
} from './dto/trip-sections.dto';
import { TripSectionsService } from './trip-sections.service';
import { TripsService } from './trips.service';

/** Wizard steps 4-9, each addressable on its own so drafts save incrementally. */
@ApiTags('Trip content')
@ApiBearerAuth()
@Controller('trips/:tripId')
export class TripSectionsController {
  constructor(
    private readonly sections: TripSectionsService,
    private readonly expenses: ExpensesService,
    private readonly trips: TripsService,
  ) {}

  // --- Places ---------------------------------------------------------------

  @Post('places')
  @ApiOperation({
    summary: 'Add a place to the trip',
    description: 'placeId must be a canonical place — create one with POST /places first.',
  })
  @ApiEnvelope(TripPlaceDto, { status: 201 })
  @ApiErrorResponses(400, 401, 403, 404)
  addPlace(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddTripPlaceDto,
  ) {
    return this.sections.addPlace(tripId, user.id, dto);
  }

  @Patch('places/:tripPlaceId')
  @ApiOperation({ summary: 'Update a place on the trip' })
  @ApiEnvelope(TripPlaceDto)
  @ApiErrorResponses(401, 403, 404)
  updatePlace(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('tripPlaceId', ParseUUIDPipe) tripPlaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTripPlaceDto,
  ) {
    return this.sections.updatePlace(tripId, tripPlaceId, user.id, dto);
  }

  @Delete('places/:tripPlaceId')
  @ApiOperation({ summary: 'Remove a place from the trip' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  removePlace(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('tripPlaceId', ParseUUIDPipe) tripPlaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sections.removePlace(tripId, tripPlaceId, user.id);
  }

  @Put('places/order')
  @ApiOperation({
    summary: 'Reorder the route',
    description: 'Send every tripPlaceId in the new order (spec §11).',
  })
  @ApiEnvelope(TripPlaceDto, { isArray: true })
  @ApiErrorResponses(400, 401, 403, 404)
  reorderPlaces(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderPlacesDto,
  ) {
    return this.sections.reorderPlaces(tripId, user.id, dto);
  }

  // --- Expenses -------------------------------------------------------------

  @Public()
  @Get('expenses')
  @ApiOperation({
    summary: 'Expense breakdown and intelligence',
    description:
      'Totals, per person, per day, per person per day and category percentages (spec §9). 404s when the author hid their spending from you.',
  })
  @ApiEnvelope(ExpenseSummaryDto)
  @ApiErrorResponses(404)
  async listExpenses(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    // findOne applies the visibility rules; expenses is null when hidden.
    const trip = await this.trips.findOne(tripId, viewer?.id);
    return trip.expenses;
  }

  @Post('expenses')
  @ApiOperation({ summary: 'Add one expense line item' })
  @ApiEnvelope(Object, { status: 201 })
  @ApiErrorResponses(400, 401, 403, 404)
  async addExpense(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseDto,
  ) {
    await this.trips.assertOwner(tripId, user.id);
    return this.expenses.create(tripId, dto);
  }

  @Put('expenses')
  @ApiOperation({
    summary: 'Replace all expense line items',
    description: 'What the wizard’s expense step submits. Returns the recalculated summary.',
  })
  @ApiEnvelope(ExpenseSummaryDto)
  @ApiErrorResponses(400, 401, 403, 404)
  async replaceExpenses(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkExpensesDto,
  ) {
    await this.trips.assertOwner(tripId, user.id);
    return this.expenses.replaceAll(tripId, dto);
  }

  @Patch('expenses/:expenseId')
  @ApiOperation({ summary: 'Update an expense line item' })
  @ApiEnvelope(Object)
  @ApiErrorResponses(400, 401, 403, 404)
  updateExpense(
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(expenseId, dto, user.id);
  }

  @Delete('expenses/:expenseId')
  @ApiOperation({ summary: 'Delete an expense line item' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  removeExpense(
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expenses.remove(expenseId, user.id);
  }

  // --- Stays ----------------------------------------------------------------

  @Post('stays')
  @ApiOperation({ summary: 'Add a stay', description: 'A trip can have several (spec §12).' })
  @ApiEnvelope(TripStayDto, { status: 201 })
  @ApiErrorResponses(400, 401, 403, 404)
  addStay(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStayDto,
  ) {
    return this.sections.addStay(tripId, user.id, dto);
  }

  @Patch('stays/:stayId')
  @ApiOperation({ summary: 'Update a stay' })
  @ApiEnvelope(TripStayDto)
  @ApiErrorResponses(400, 401, 403, 404)
  updateStay(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('stayId', ParseUUIDPipe) stayId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStayDto,
  ) {
    return this.sections.updateStay(tripId, stayId, user.id, dto);
  }

  @Delete('stays/:stayId')
  @ApiOperation({ summary: 'Remove a stay' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  removeStay(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('stayId', ParseUUIDPipe) stayId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sections.removeStay(tripId, stayId, user.id);
  }

  // --- Photos ---------------------------------------------------------------

  @Post('photos')
  @ApiOperation({
    summary: 'Attach uploaded photos to the trip',
    description:
      'Upload files with POST /media/upload first, then attach the returned media ids — optionally tagged with the place they were taken at (spec §17).',
  })
  @ApiEnvelope(TripPhotoDto, { status: 201, isArray: true })
  @ApiErrorResponses(400, 401, 403, 404)
  addPhotos(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddTripPhotosDto,
  ) {
    return this.sections.addPhotos(tripId, user.id, dto);
  }

  @Delete('photos/:photoId')
  @ApiOperation({ summary: 'Remove a photo from the trip' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  removePhoto(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sections.removePhoto(tripId, photoId, user.id);
  }

  // --- Ratings --------------------------------------------------------------

  @Put('ratings')
  @ApiOperation({
    summary: 'Submit or update a rating group',
    description:
      'Upsert: re-submitting overwrites the previous scores for the same target. Only criteria valid for the ratingType are accepted — see GET /trips/meta/enums.',
  })
  @ApiEnvelope(Object, { isArray: true })
  @ApiErrorResponses(400, 401, 403, 404)
  submitRatings(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitRatingsDto,
  ) {
    return this.sections.submitRatings(tripId, user.id, dto);
  }

  // --- Reality checks -------------------------------------------------------

  @Post('reality-checks')
  @ApiOperation({
    summary: 'Add a reality check',
    description: 'Practical warnings for the next traveler (spec §16).',
  })
  @ApiEnvelope(RealityCheckDto, { status: 201 })
  @ApiErrorResponses(400, 401, 403, 404)
  addRealityCheck(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRealityCheckDto,
  ) {
    return this.sections.addRealityCheck(tripId, user.id, dto);
  }

  @Delete('reality-checks/:id')
  @ApiOperation({ summary: 'Remove a reality check' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 403, 404)
  removeRealityCheck(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sections.removeRealityCheck(tripId, id, user.id);
  }
}
