import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrorResponses,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
} from 'src/common/decorators';
import { MessageDto } from 'src/common/dto/message.dto';
import { CursorPaginationDto } from 'src/common/dto/pagination.dto';
import { CollectionDto, ToggleResultDto } from 'src/modules/posts/dto/post-response.dto';
import { CreateCollectionDto, SavePostDto } from 'src/modules/posts/dto/post.dto';
import { TripCardDto } from 'src/modules/trips/dto/trip-response.dto';
import { CollectionsService } from './collections.service';

@ApiTags('Saved')
@ApiBearerAuth()
@Controller()
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get('collections')
  @ApiOperation({ summary: 'Your collections', description: 'The Saved tab (spec §21).' })
  @ApiEnvelope(CollectionDto, { isArray: true })
  @ApiErrorResponses(401)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.collections.listCollections(user.id);
  }

  @Post('collections')
  @ApiOperation({ summary: 'Create a collection' })
  @ApiEnvelope(CollectionDto, { status: 201 })
  @ApiErrorResponses(400, 401)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCollectionDto) {
    return this.collections.createCollection(user.id, dto);
  }

  @Delete('collections/:id')
  @ApiOperation({
    summary: 'Delete a collection',
    description: 'Saves inside it are kept and become uncategorised.',
  })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401, 404)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.collections.removeCollection(id, user.id);
  }

  @Get('saved/trips')
  @ApiOperation({ summary: 'Trips you saved' })
  @ApiQuery({ name: 'collectionId', required: false, format: 'uuid' })
  @ApiPaginatedEnvelope(TripCardDto)
  @ApiErrorResponses(401)
  savedTrips(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationDto,
    @Query('collectionId') collectionId?: string,
  ) {
    return this.collections.listSavedTrips(user.id, query, collectionId);
  }

  @Post('trips/:tripId/save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save a trip',
    description: 'Pass collectionId to file it. Re-saving moves it to the new collection.',
  })
  @ApiEnvelope(ToggleResultDto)
  @ApiErrorResponses(401, 404)
  saveTrip(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SavePostDto,
  ) {
    return this.collections.saveTrip(tripId, user.id, dto);
  }

  @Delete('trips/:tripId/save')
  @ApiOperation({ summary: 'Unsave a trip' })
  @ApiEnvelope(ToggleResultDto)
  @ApiErrorResponses(401, 404)
  unsaveTrip(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.collections.unsaveTrip(tripId, user.id);
  }
}
