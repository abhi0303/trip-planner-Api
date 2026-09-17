import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiPaginatedEnvelope,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { OffsetPaginationDto } from 'src/common/dto/pagination.dto';
import { PlaceSummaryDto } from 'src/modules/places/dto/place-response.dto';
import { TripCardDto } from 'src/modules/trips/dto/trip-response.dto';
import { UserSummaryDto } from 'src/modules/users/dto/user-response.dto';
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
  @ApiQuery({ name: 'q', example: 'cola' })
  @ApiPaginatedEnvelope(PlaceSummaryDto)
  places(@Query('q') q: string, @Query() page: OffsetPaginationDto) {
    return this.search.places(q ?? '', page);
  }

  @Get('trips')
  @ApiOperation({
    summary: 'Search trips',
    description: 'Matches title, destination, experience text and the places visited.',
  })
  @ApiQuery({ name: 'q', example: 'budget goa trip' })
  @ApiPaginatedEnvelope(TripCardDto)
  trips(
    @Query('q') q: string,
    @Query() page: OffsetPaginationDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.search.trips_(q ?? '', page, viewer?.id);
  }

  @Get('users')
  @ApiOperation({ summary: 'Search people' })
  @ApiQuery({ name: 'q', example: 'sreyanse' })
  @ApiPaginatedEnvelope(UserSummaryDto)
  users(
    @Query('q') q: string,
    @Query() page: OffsetPaginationDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.search.users(q ?? '', page, viewer?.id);
  }
}
