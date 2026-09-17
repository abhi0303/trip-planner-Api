import { Module } from '@nestjs/common';
import { PlaceAggregatesService } from './place-aggregates.service';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  controllers: [PlacesController],
  providers: [PlacesService, PlaceAggregatesService],
  exports: [PlacesService, PlaceAggregatesService],
})
export class PlacesModule {}
