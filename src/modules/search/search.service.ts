import { Injectable } from '@nestjs/common';
import { Prisma, TripStatus, UserStatus } from '@prisma/client';
import { VisibilityService } from 'src/common/services/visibility.service';
import { OffsetPaginationDto } from 'src/common/dto/pagination.dto';
import { PLACE_SUMMARY_SELECT } from 'src/modules/places/place-aggregates.service';
import { TRIP_CARD_SELECT, TripsService } from 'src/modules/trips/trips.service';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Search (spec §22).
 *
 * MVP uses ILIKE over the columns people actually type into the box. It is the
 * right amount of machinery for launch volumes; the upgrade path is a Postgres
 * tsvector column plus a GIN index, which changes only this file.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly trips: TripsService,
  ) {}

  /** Mixed results for the main search box. */
  async all(q: string, viewerId?: string) {
    const [places, trips, users] = await Promise.all([
      this.places(q, { page: 1, limit: 5, skip: 0 } as OffsetPaginationDto),
      this.trips_(q, { page: 1, limit: 5, skip: 0 } as OffsetPaginationDto, viewerId),
      this.users(q, { page: 1, limit: 5, skip: 0 } as OffsetPaginationDto, viewerId),
    ]);

    return {
      query: q,
      places: places.items,
      trips: trips.items,
      users: users.items,
      totals: { places: places.total, trips: trips.total, users: users.total },
    };
  }

  async places(q: string, page: OffsetPaginationDto) {
    const where: Prisma.PlaceWhereInput = {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { region: { contains: q, mode: 'insensitive' } },
        { state: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { country: { contains: q, mode: 'insensitive' } },
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.place.findMany({
        where,
        select: PLACE_SUMMARY_SELECT,
        orderBy: [{ experienceCount: 'desc' }, { name: 'asc' }],
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.place.count({ where }),
    ]);

    return { items, total, hasMore: page.skip + items.length < total, nextCursor: null };
  }

  async trips_(q: string, page: OffsetPaginationDto, viewerId?: string) {
    const where: Prisma.TripWhereInput = {
      deletedAt: null,
      status: TripStatus.PUBLISHED,
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { destination: { contains: q, mode: 'insensitive' } },
        { state: { contains: q, mode: 'insensitive' } },
        { country: { contains: q, mode: 'insensitive' } },
        { experience: { contains: q, mode: 'insensitive' } },
        { places: { some: { place: { name: { contains: q, mode: 'insensitive' } } } } },
      ],
      AND: [this.visibility.visibilityFilter(viewerId), this.visibility.blockFilter(viewerId)],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where,
        select: TRIP_CARD_SELECT,
        orderBy: [{ saveCount: 'desc' }, { publishedAt: 'desc' }],
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.trip.count({ where }),
    ]);

    return {
      items: await this.trips.toCards(rows, viewerId),
      total,
      hasMore: page.skip + rows.length < total,
      nextCursor: null,
    };
  }

  async users(q: string, page: OffsetPaginationDto, viewerId?: string) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      status: UserStatus.ACTIVE,
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
      ...(viewerId
        ? {
            blocksMade: { none: { blockedId: viewerId } },
            blocksReceived: { none: { blockerId: viewerId } },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          name: true,
          profileImage: true,
          followerCount: true,
        },
        orderBy: [{ followerCount: 'desc' }, { username: 'asc' }],
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const followed =
      viewerId && rows.length
        ? new Set(
            (
              await this.prisma.follow.findMany({
                where: { followerId: viewerId, followingId: { in: rows.map((r) => r.id) } },
                select: { followingId: true },
              })
            ).map((f) => f.followingId),
          )
        : new Set<string>();

    return {
      items: rows.map((u) => ({
        ...u,
        isFollowing: viewerId ? followed.has(u.id) : null,
      })),
      total,
      hasMore: page.skip + rows.length < total,
      nextCursor: null,
    };
  }
}
