import { Module } from '@nestjs/common';
import { PlacesModule } from 'src/modules/places/places.module';
import { ExpensesService } from './expenses.service';
import { ItineraryController } from './itinerary.controller';
import { ItineraryService } from './itinerary.service';
import { TripSectionsController } from './trip-sections.controller';
import { TripSectionsService } from './trip-sections.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [PlacesModule],
  controllers: [TripsController, TripSectionsController, ItineraryController],
  providers: [TripsService, ExpensesService, TripSectionsService, ItineraryService],
  exports: [TripsService, ExpensesService],
})
export class TripsModule {}
