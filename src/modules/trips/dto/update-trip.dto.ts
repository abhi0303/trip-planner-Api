import { PartialType } from '@nestjs/swagger';
import { CreateTripDto } from './create-trip.dto';

/**
 * Every field optional — the wizard PATCHes one step at a time.
 * Duration and season are recalculated whenever either date changes.
 */
export class UpdateTripDto extends PartialType(CreateTripDto) {}
