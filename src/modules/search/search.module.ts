import { Module } from '@nestjs/common';
import { TripsModule } from 'src/modules/trips/trips.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TripsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
