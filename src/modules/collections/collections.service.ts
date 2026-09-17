import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { VisibilityService } from 'src/common/services/visibility.service';
import { CursorPaginationDto } from 'src/common/dto/pagination.dto';
import { buildPage, decodeCursor } from 'src/common/utils';
import { TRIP_CARD_SELECT, TripsService } from 'src/modules/trips/trips.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCollectionDto, SavePostDto } from 'src/modules/posts/dto/post.dto';
import { CollectionDto } from 'src/modules/posts/dto/post-response.dto';

/**
 * Saved trips and collections (spec §21). A Save points at either a trip or a
 * post and may optionally sit inside a collection ("Goa Plans").
 */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly visibility: VisibilityService,
  ) {}

  async listCollections(userId: string): Promise<CollectionDto[]> {
    return this.prisma.collection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        emoji: true,
        isPrivate: true,
        itemCount: true,
        createdAt: true,
      },
    });
  }

  async createCollection(userId: string, dto: CreateCollectionDto): Promise<CollectionDto> {
    const existing = await this.prisma.collection.findUnique({
      where: { userId_name: { userId, name: dto.name } },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('You already have a collection with that name');

    return this.prisma.collection.create({
      data: { userId, name: dto.name, emoji: dto.emoji, isPrivate: dto.isPrivate ?? false },
      select: {
        id: true,
        name: true,
        emoji: true,
        isPrivate: true,
        itemCount: true,
        createdAt: true,
      },
    });
  }

  async removeCollection(collectionId: string, userId: string): Promise<{ message: string }> {
    const deleted = await this.prisma.collection.deleteMany({ where: { id: collectionId, userId } });
    if (deleted.count === 0) throw new NotFoundException('Collection not found');
    // Saves survive: onDelete SetNull leaves them uncategorised rather than
    // silently deleting a user's bookmarks.
    return { message: 'Collection deleted. Its saves are now uncategorised.' };
  }

  /** Saved trips, optionally scoped to one collection. */
  async listSavedTrips(userId: string, query: CursorPaginationDto, collectionId?: string) {
    const cursor = decodeCursor(query.cursor);

    const saves = await this.prisma.save.findMany({
      where: {
        userId,
        tripId: { not: null },
        ...(collectionId ? { collectionId } : {}),
        ...(cursor ? { createdAt: { lt: new Date(cursor.v) } } : {}),
        trip: {
          deletedAt: null,
          status: TripStatus.PUBLISHED,
          AND: [this.visibility.visibilityFilter(userId)],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      select: { id: true, createdAt: true, trip: { select: TRIP_CARD_SELECT } },
    });

    const page = buildPage(saves, query.limit, (s) => s.createdAt);

    return {
      ...page,
      items: await this.trips.toCards(
        page.items.map((s) => s.trip).filter(Boolean),
        userId,
      ),
    };
  }

  async saveTrip(tripId: string, userId: string, dto: SavePostDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      select: { id: true, userId: true, visibility: true, saveCount: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    if (!(await this.visibility.canView(userId, { id: trip.userId }, trip.visibility))) {
      throw new NotFoundException('Trip not found');
    }
    if (dto.collectionId) await this.assertOwnsCollection(dto.collectionId, userId);

    const existing = await this.prisma.save.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.save.update({
        where: { id: existing.id },
        data: { collectionId: dto.collectionId, note: dto.note },
      });
      return { active: true, count: trip.saveCount };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.save.create({
        data: { userId, tripId, collectionId: dto.collectionId, note: dto.note },
      }),
      this.prisma.trip.update({
        where: { id: tripId },
        data: { saveCount: { increment: 1 } },
        select: { saveCount: true },
      }),
      ...(dto.collectionId
        ? [
            this.prisma.collection.update({
              where: { id: dto.collectionId },
              data: { itemCount: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    return { active: true, count: updated.saveCount };
  }

  async unsaveTrip(tripId: string, userId: string) {
    const existing = await this.prisma.save.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { id: true, collectionId: true },
    });

    if (!existing) {
      const trip = await this.prisma.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: { saveCount: true },
      });
      return { active: false, count: trip.saveCount };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.save.delete({ where: { id: existing.id } }),
      this.prisma.trip.update({
        where: { id: tripId },
        data: { saveCount: { decrement: 1 } },
        select: { saveCount: true },
      }),
      ...(existing.collectionId
        ? [
            this.prisma.collection.update({
              where: { id: existing.collectionId },
              data: { itemCount: { decrement: 1 } },
            }),
          ]
        : []),
    ]);

    return { active: false, count: updated.saveCount };
  }

  private async assertOwnsCollection(collectionId: string, userId: string): Promise<void> {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!collection) throw new NotFoundException('Collection not found');
  }
}
