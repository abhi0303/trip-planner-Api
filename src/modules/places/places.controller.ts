import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrorResponses,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { TripCardDto } from 'src/modules/trips/dto/trip-response.dto';
import { PlaceDetailDto, PlaceSummaryDto } from './dto/place-response.dto';
import { CreatePlaceDto, PlaceExperiencesQueryDto, SearchPlacesDto } from './dto/place.dto';
import { PlacesService } from './places.service';

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Public()
  @Get('search')
  @ApiOperation({
    summary: 'Search places',
    description:
      'Type-ahead for the trip wizard. Prefix matches rank first, then places with more experiences.',
  })
  @ApiPaginatedEnvelope(PlaceSummaryDto)
  search(@Query() query: SearchPlacesDto) {
    return this.places.search(query);
  }

  @Public()
  @Get('popular')
  @ApiOperation({ summary: 'Most documented places', description: 'Explore screen fallback.' })
  @ApiEnvelope(PlaceSummaryDto, { isArray: true })
  popular() {
    return this.places.popular();
  }

  @Public()
  @Get('destinations')
  @ApiOperation({
    summary: 'Destinations that have published trips',
    description: 'Feeds country/state filter dropdowns.',
  })
  @ApiEnvelope(Object, { isArray: true })
  destinations(@Query('countryCode') countryCode?: string) {
    return this.places.destinations(countryCode);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Find or create a canonical place',
    description:
      'Returns the existing place when one matches on name + country + state, so trips never store free-text place names (spec §10).',
  })
  @ApiEnvelope(PlaceSummaryDto, { status: 201 })
  @ApiErrorResponses(400, 401)
  create(@Body() dto: CreatePlaceDto) {
    return this.places.findOrCreate(dto);
  }

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({
    summary: 'Place page',
    description:
      'Includes aggregate statistics. Averages are null until MIN_SAMPLE_SIZE experiences exist (spec §24).',
  })
  @ApiParam({ name: 'idOrSlug', example: 'cola-beach-goa' })
  @ApiEnvelope(PlaceDetailDto)
  @ApiErrorResponses(404)
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.places.findOne(idOrSlug);
  }

  @Public()
  @Get(':idOrSlug/experiences')
  @ApiOperation({
    summary: 'Traveler experiences at this place',
    description: 'Optionally filtered to one month for seasonal comparison (spec §30).',
  })
  @ApiParam({ name: 'idOrSlug', example: 'cola-beach-goa' })
  @ApiPaginatedEnvelope(TripCardDto)
  @ApiErrorResponses(404)
  experiences(
    @Param('idOrSlug') idOrSlug: string,
    @Query() query: PlaceExperiencesQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.places.experiences(idOrSlug, query, viewer?.id);
  }
}
