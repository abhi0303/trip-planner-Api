import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PLACE_SUMMARY_SELECT } from 'src/modules/places/place-aggregates.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateActivityDto,
  MoveActivitiesDto,
  ReorderActivitiesDto,
  UpdateActivityDto,
  UpsertTripDayDto,
} from './dto/trip-sections.dto';
import { TripsService } from './trips.service';

/**
 * Day-by-day itinerary (spec §27). Days are addressed by their number so FE can
 * PUT day 2 without first looking up its id.
 */
@Injectable()
export class ItineraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
  ) {}

  async list(tripId: string, viewerId?: string) {
    // Reuses the trip read path so itinerary inherits the same visibility rules.
    const trip = await this.trips.findOne(tripId, viewerId);
    return trip.itinerary;
  }

  async upsertDay(tripId: string, userId: string, dto: UpsertTripDayDto) {
    const trip = await this.trips.assertOwner(tripId, userId);

    if (dto.dayNumber > trip.days) {
      throw new BadRequestException(
        `This trip is ${trip.days} days long, so day ${dto.dayNumber} does not exist`,
      );
    }

    // Day N falls on startDate + (N-1).
    const date = new Date(trip.startDate);
    date.setUTCDate(date.getUTCDate() + dto.dayNumber - 1);

    return this.prisma.tripDay.upsert({
      where: { tripId_dayNumber: { tripId, dayNumber: dto.dayNumber } },
      create: {
        tripId,
        dayNumber: dto.dayNumber,
        date,
        title: dto.title,
        summary: dto.summary,
      },
      update: { title: dto.title, summary: dto.summary, date },
      include: { activities: { orderBy: { sequence: 'asc' } } },
    });
  }

  async removeDay(tripId: string, dayNumber: number, userId: string) {
    await this.trips.assertOwner(tripId, userId);
    const deleted = await this.prisma.tripDay.deleteMany({ where: { tripId, dayNumber } });
    if (deleted.count === 0) throw new NotFoundException('Day not found');
    return { message: `Day ${dayNumber} removed` };
  }

  async addActivity(tripId: string, dayNumber: number, userId: string, dto: CreateActivityDto) {
    await this.trips.assertOwner(tripId, userId);

    // Adding an activity to a day that was never described implies the day.
    const day = await this.upsertDay(tripId, userId, { dayNumber });

    const sequence = dto.sequence ?? (await this.nextSequence(day.id));

    return this.prisma.tripActivity.create({
      data: {
        dayId: day.id,
        title: dto.title,
        kind: dto.kind,
        placeId: dto.placeId,
        startTime: dto.startTime,
        endTime: dto.endTime,
        notes: dto.notes,
        sequence,
      },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  async updateActivity(tripId: string, activityId: string, userId: string, dto: UpdateActivityDto) {
    await this.trips.assertOwner(tripId, userId);
    const current = await this.assertActivityOnTrip(tripId, activityId);

    // Moving days is an edit, not a delete-and-recreate: the activity keeps its
    // id, its place and its times, and a half-failed move cannot lose what the
    // traveller typed.
    const move =
      dto.dayNumber === undefined
        ? null
        : await this.resolveMoveTarget(tripId, userId, dto.dayNumber, current.dayId, dto.sequence);

    return this.prisma.tripActivity.update({
      where: { id: activityId },
      data: {
        title: dto.title,
        kind: dto.kind,
        placeId: dto.placeId,
        startTime: dto.startTime,
        endTime: dto.endTime,
        notes: dto.notes,
        ...(move ? { dayId: move.dayId, sequence: move.sequence } : { sequence: dto.sequence }),
      },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  /**
   * Moves a set of activities to one day in a single transaction, so a
   * mis-filed group either lands together or not at all.
   */
  async moveActivities(tripId: string, userId: string, dto: MoveActivitiesDto) {
    await this.trips.assertOwner(tripId, userId);

    const ordered = [...new Set(dto.activityIds)];

    const found = await this.prisma.tripActivity.findMany({
      where: { id: { in: ordered }, day: { tripId } },
      select: { id: true },
    });
    const known = new Set(found.map((a) => a.id));
    const missing = ordered.filter((id) => !known.has(id));
    if (missing.length) {
      throw new NotFoundException(`These activities are not on this trip: ${missing.join(', ')}`);
    }

    // upsertDay enforces the trip's day range and creates the day when needed.
    const day = await this.upsertDay(tripId, userId, { dayNumber: dto.dayNumber });

    // Append in the order given, after whatever is already on that day. Ids
    // being moved are excluded so re-sending the same set is stable.
    const base = await this.nextSequence(day.id, ordered);

    await this.prisma.$transaction(
      ordered.map((id, index) =>
        this.prisma.tripActivity.update({
          where: { id },
          data: { dayId: day.id, sequence: base + index },
        }),
      ),
    );

    // Both the source and target days changed, so return the whole itinerary
    // and let the client replace its state in one go.
    return this.list(tripId, userId);
  }

  /**
   * Works out where a moved activity lands. Staying on the same day keeps its
   * position unless the caller asked for one, so a plain field edit that also
   * echoes the current dayNumber does not silently reorder the day.
   */
  private async resolveMoveTarget(
    tripId: string,
    userId: string,
    dayNumber: number,
    currentDayId: string,
    explicitSequence?: number,
  ): Promise<{ dayId: string; sequence: number | undefined }> {
    const day = await this.upsertDay(tripId, userId, { dayNumber });

    if (day.id === currentDayId) {
      return { dayId: day.id, sequence: explicitSequence };
    }

    return {
      dayId: day.id,
      sequence: explicitSequence ?? (await this.nextSequence(day.id)),
    };
  }

  async removeActivity(tripId: string, activityId: string, userId: string) {
    await this.trips.assertOwner(tripId, userId);
    await this.assertActivityOnTrip(tripId, activityId);

    await this.prisma.tripActivity.delete({ where: { id: activityId } });
    return { message: 'Activity removed' };
  }

  /** Drag-and-drop within one day. */
  async reorderActivities(
    tripId: string,
    dayNumber: number,
    userId: string,
    dto: ReorderActivitiesDto,
  ) {
    await this.trips.assertOwner(tripId, userId);

    const day = await this.prisma.tripDay.findUnique({
      where: { tripId_dayNumber: { tripId, dayNumber } },
      include: { activities: { select: { id: true } } },
    });
    if (!day) throw new NotFoundException('Day not found');

    const known = new Set(day.activities.map((a) => a.id));
    if (dto.activityIds.length !== known.size || dto.activityIds.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'activityIds must contain every activity on this day, exactly once',
      );
    }

    await this.prisma.$transaction(
      dto.activityIds.map((id, index) =>
        this.prisma.tripActivity.update({ where: { id }, data: { sequence: index } }),
      ),
    );

    return this.prisma.tripActivity.findMany({
      where: { dayId: day.id },
      orderBy: { sequence: 'asc' },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  private async nextSequence(dayId: string, excludeIds: string[] = []): Promise<number> {
    const last = await this.prisma.tripActivity.aggregate({
      where: { dayId, ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}) },
      _max: { sequence: true },
    });
    return (last._max.sequence ?? -1) + 1;
  }

  private async assertActivityOnTrip(
    tripId: string,
    activityId: string,
  ): Promise<{ id: string; dayId: string }> {
    const activity = await this.prisma.tripActivity.findFirst({
      where: { id: activityId, day: { tripId } },
      select: { id: true, dayId: true },
    });
    if (!activity) throw new NotFoundException('Activity not found on this trip');
    return activity;
  }
}
