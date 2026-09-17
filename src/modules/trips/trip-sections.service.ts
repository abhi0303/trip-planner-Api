import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RatingType } from '@prisma/client';
import { RATING_CRITERIA_MATRIX, isCriteriaAllowed } from 'src/common/constants';
import { nightsBetween } from 'src/common/utils';
import { PLACE_SUMMARY_SELECT } from 'src/modules/places/place-aggregates.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  AddTripPhotosDto,
  AddTripPlaceDto,
  CreateRealityCheckDto,
  CreateStayDto,
  ReorderPlacesDto,
  SubmitRatingsDto,
  UpdateStayDto,
  UpdateTripPlaceDto,
} from './dto/trip-sections.dto';
import { TripsService } from './trips.service';

/**
 * Sub-resources of a trip: places, stays, photos, ratings and reality checks.
 * Every method goes through TripsService.assertOwner first, so ownership is
 * enforced in exactly one place.
 */
@Injectable()
export class TripSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
  ) {}

  // --- Places --------------------------------------------------------------

  async addPlace(tripId: string, userId: string, dto: AddTripPlaceDto) {
    await this.trips.assertOwner(tripId, userId);

    const place = await this.prisma.place.findUnique({
      where: { id: dto.placeId },
      select: { id: true },
    });
    if (!place) throw new NotFoundException('Place not found');

    const duplicate = await this.prisma.tripPlace.findUnique({
      where: { tripId_placeId: { tripId, placeId: dto.placeId } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('This place is already on the trip');

    const sequence = dto.sequence ?? (await this.nextSequence(tripId));

    const created = await this.prisma.tripPlace.create({
      data: {
        tripId,
        placeId: dto.placeId,
        visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
        sequence,
        durationMinutes: dto.durationMinutes,
        notes: dto.notes,
      },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });

    await this.trips.refreshCounters(tripId);
    return created;
  }

  async updatePlace(tripId: string, tripPlaceId: string, userId: string, dto: UpdateTripPlaceDto) {
    await this.trips.assertOwner(tripId, userId);

    const existing = await this.prisma.tripPlace.findFirst({
      where: { id: tripPlaceId, tripId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Place is not on this trip');

    return this.prisma.tripPlace.update({
      where: { id: tripPlaceId },
      data: {
        visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
        sequence: dto.sequence,
        durationMinutes: dto.durationMinutes,
        notes: dto.notes,
      },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  async removePlace(tripId: string, tripPlaceId: string, userId: string) {
    await this.trips.assertOwner(tripId, userId);

    const deleted = await this.prisma.tripPlace.deleteMany({ where: { id: tripPlaceId, tripId } });
    if (deleted.count === 0) throw new NotFoundException('Place is not on this trip');

    await this.trips.refreshCounters(tripId);
    return { message: 'Place removed from trip' };
  }

  /** Drag-and-drop reordering of the route (spec §11). */
  async reorderPlaces(tripId: string, userId: string, dto: ReorderPlacesDto) {
    await this.trips.assertOwner(tripId, userId);

    const existing = await this.prisma.tripPlace.findMany({
      where: { tripId },
      select: { id: true },
    });
    const known = new Set(existing.map((p) => p.id));

    if (dto.tripPlaceIds.length !== known.size || dto.tripPlaceIds.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'tripPlaceIds must contain every place currently on the trip, exactly once',
      );
    }

    await this.prisma.$transaction(
      dto.tripPlaceIds.map((id, index) =>
        this.prisma.tripPlace.update({ where: { id }, data: { sequence: index } }),
      ),
    );

    return this.prisma.tripPlace.findMany({
      where: { tripId },
      orderBy: { sequence: 'asc' },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  // --- Stays ---------------------------------------------------------------

  async addStay(tripId: string, userId: string, dto: CreateStayDto) {
    const trip = await this.trips.assertOwner(tripId, userId);

    return this.prisma.tripStay.create({
      data: {
        tripId,
        hotelName: dto.hotelName,
        placeId: dto.placeId,
        location: dto.location,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        nights: this.stayNights(dto),
        amount: dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
        currency: trip.currency,
        roomType: dto.roomType,
        rating: dto.rating,
        bookingPlatform: dto.bookingPlatform,
        websiteUrl: dto.websiteUrl,
        notes: dto.notes,
      },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  async updateStay(tripId: string, stayId: string, userId: string, dto: UpdateStayDto) {
    await this.trips.assertOwner(tripId, userId);

    const existing = await this.prisma.tripStay.findFirst({
      where: { id: stayId, tripId },
    });
    if (!existing) throw new NotFoundException('Stay not found');

    const checkIn = dto.checkIn ? new Date(dto.checkIn) : existing.checkIn;
    const checkOut = dto.checkOut ? new Date(dto.checkOut) : existing.checkOut;

    return this.prisma.tripStay.update({
      where: { id: stayId },
      data: {
        hotelName: dto.hotelName,
        placeId: dto.placeId,
        location: dto.location,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        nights: checkIn && checkOut ? nightsBetween(checkIn, checkOut) : undefined,
        amount: dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
        roomType: dto.roomType,
        rating: dto.rating,
        bookingPlatform: dto.bookingPlatform,
        websiteUrl: dto.websiteUrl,
        notes: dto.notes,
      },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  async removeStay(tripId: string, stayId: string, userId: string) {
    await this.trips.assertOwner(tripId, userId);
    const deleted = await this.prisma.tripStay.deleteMany({ where: { id: stayId, tripId } });
    if (deleted.count === 0) throw new NotFoundException('Stay not found');
    return { message: 'Stay removed' };
  }

  // --- Photos --------------------------------------------------------------

  async addPhotos(tripId: string, userId: string, dto: AddTripPhotosDto) {
    await this.trips.assertOwner(tripId, userId);

    // Only media the caller uploaded may be attached.
    const mediaIds = dto.photos.map((p) => p.mediaId);
    const owned = await this.prisma.media.findMany({
      where: { id: { in: mediaIds }, userId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((m) => m.id));
    const foreign = mediaIds.filter((id) => !ownedIds.has(id));
    if (foreign.length) {
      throw new BadRequestException(`These media ids are not yours or do not exist: ${foreign.join(', ')}`);
    }

    const base = await this.nextPhotoSequence(tripId);

    await this.prisma.tripPhoto.createMany({
      data: dto.photos.map((p, i) => ({
        tripId,
        mediaId: p.mediaId,
        placeId: p.placeId,
        caption: p.caption,
        takenAt: p.takenAt ? new Date(p.takenAt) : undefined,
        sequence: p.sequence ?? base + i,
      })),
      skipDuplicates: true,
    });

    await this.trips.refreshCounters(tripId);
    await this.setCoverIfMissing(tripId, mediaIds[0]);

    return this.prisma.tripPhoto.findMany({
      where: { tripId },
      orderBy: { sequence: 'asc' },
      include: {
        media: { select: { id: true, url: true, thumbnailUrl: true, blurhash: true } },
        place: { select: PLACE_SUMMARY_SELECT },
      },
    });
  }

  async removePhoto(tripId: string, photoId: string, userId: string) {
    await this.trips.assertOwner(tripId, userId);
    const deleted = await this.prisma.tripPhoto.deleteMany({ where: { id: photoId, tripId } });
    if (deleted.count === 0) throw new NotFoundException('Photo not found');
    await this.trips.refreshCounters(tripId);
    return { message: 'Photo removed' };
  }

  // --- Ratings -------------------------------------------------------------

  /**
   * Upserts a whole rating group at once, so re-submitting the ratings step of
   * the wizard overwrites rather than duplicates.
   */
  async submitRatings(tripId: string, userId: string, dto: SubmitRatingsDto) {
    await this.trips.assertOwner(tripId, userId);

    if (dto.ratingType === RatingType.PLACE && !dto.placeId) {
      throw new BadRequestException('placeId is required for PLACE ratings');
    }
    if (dto.ratingType === RatingType.HOTEL && !dto.stayId) {
      throw new BadRequestException('stayId is required for HOTEL ratings');
    }

    const invalid = dto.ratings.filter((r) => !isCriteriaAllowed(dto.ratingType, r.criteria));
    if (invalid.length) {
      throw new BadRequestException(
        `${invalid.map((r) => r.criteria).join(', ')} cannot be used for a ${dto.ratingType} rating. Allowed: ${RATING_CRITERIA_MATRIX[dto.ratingType].join(', ')}`,
      );
    }

    if (dto.placeId) {
      const onTrip = await this.prisma.tripPlace.findUnique({
        where: { tripId_placeId: { tripId, placeId: dto.placeId } },
        select: { id: true },
      });
      if (!onTrip) throw new BadRequestException('You can only rate places that are on this trip');
    }

    // Replace the group rather than upsert it: the rating target is partly
    // nullable (placeId/stayId), and Postgres treats NULLs as distinct inside a
    // UNIQUE constraint, so an upsert keyed on it would silently duplicate
    // trip-level ratings.
    await this.prisma.$transaction([
      this.prisma.tripRating.deleteMany({
        where: {
          tripId,
          ratingType: dto.ratingType,
          placeId: dto.placeId ?? null,
          stayId: dto.stayId ?? null,
        },
      }),
      this.prisma.tripRating.createMany({
        data: dto.ratings.map((r) => ({
          tripId,
          ratingType: dto.ratingType,
          placeId: dto.placeId,
          stayId: dto.stayId,
          criteria: r.criteria,
          score: r.score,
        })),
      }),
    ]);

    if (dto.placeId) await this.trips.refreshPlaceAggregates(tripId);

    return this.prisma.tripRating.findMany({
      where: { tripId },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  /** Which criteria FE should render for a given rating target. */
  ratingCriteria() {
    return Object.entries(RATING_CRITERIA_MATRIX).map(([ratingType, criteria]) => ({
      ratingType,
      criteria,
    }));
  }

  // --- Reality checks ------------------------------------------------------

  async addRealityCheck(tripId: string, userId: string, dto: CreateRealityCheckDto) {
    await this.trips.assertOwner(tripId, userId);

    return this.prisma.realityCheck.create({
      data: {
        tripId,
        placeId: dto.placeId,
        severity: dto.severity,
        text: dto.text,
      },
      include: { place: { select: PLACE_SUMMARY_SELECT } },
    });
  }

  async removeRealityCheck(tripId: string, id: string, userId: string) {
    await this.trips.assertOwner(tripId, userId);
    const deleted = await this.prisma.realityCheck.deleteMany({ where: { id, tripId } });
    if (deleted.count === 0) throw new NotFoundException('Reality check not found');
    return { message: 'Reality check removed' };
  }

  // --- helpers -------------------------------------------------------------

  private async nextSequence(tripId: string): Promise<number> {
    const last = await this.prisma.tripPlace.aggregate({
      where: { tripId },
      _max: { sequence: true },
    });
    return (last._max.sequence ?? -1) + 1;
  }

  private async nextPhotoSequence(tripId: string): Promise<number> {
    const last = await this.prisma.tripPhoto.aggregate({
      where: { tripId },
      _max: { sequence: true },
    });
    return (last._max.sequence ?? -1) + 1;
  }

  private stayNights(dto: CreateStayDto): number | undefined {
    if (!dto.checkIn || !dto.checkOut) return undefined;
    return nightsBetween(new Date(dto.checkIn), new Date(dto.checkOut));
  }

  /** First uploaded photo becomes the cover unless one was chosen. */
  private async setCoverIfMissing(tripId: string, mediaId?: string): Promise<void> {
    if (!mediaId) return;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { coverMediaId: true },
    });
    if (trip && !trip.coverMediaId) {
      await this.prisma.trip.update({ where: { id: tripId }, data: { coverMediaId: mediaId } });
    }
  }
}
