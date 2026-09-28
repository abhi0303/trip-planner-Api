import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { PlaceSummaryDto } from 'src/modules/places/dto/place-response.dto';
import { TripCardDto } from 'src/modules/trips/dto/trip-response.dto';
import { UserSummaryDto } from 'src/modules/users/dto/user-response.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Public()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Search everything',
    description: 'Returns the top 5 places, trips and users for the query (spec §22).',
  })
  @ApiQuery({ name: 'q', example: 'goa' })
  @ApiEnvelope(Object)
  all(@Query('q') q: string, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.search.all(q ?? '', viewer?.id);
  }

  @Get('places')
  @ApiOperation({ summary: 'Search places' })
  @ApiQuery({ name: 'q', type: String, example: 'cola' })
  @ApiPaginatedEnvelope(PlaceSummaryDto)
  places(@Query() query: SearchQueryDto) {
    return this.search.places(query.q ?? '', query);
  }

  @Get('trips')
  @ApiOperation({
    summary: 'Search trips',
    description: 'Matches title, destination, experience text and the places visited.',
  })
  @ApiQuery({ name: 'q', type: String, example: 'budget goa trip' })
  @ApiPaginatedEnvelope(TripCardDto)
  trips(@Query() query: SearchQueryDto, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.search.trips_(query.q ?? '', query, viewer?.id);
  }

  @Get('users')
  @ApiOperation({ summary: 'Search people' })
  @ApiQuery({ name: 'q', type: String, example: 'sreyanse' })
  @ApiPaginatedEnvelope(UserSummaryDto)
  users(@Query() query: SearchQueryDto, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.search.users(query.q ?? '', query, viewer?.id);
  }
}
