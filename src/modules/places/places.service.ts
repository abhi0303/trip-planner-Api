import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { VisibilityService } from 'src/common/services/visibility.service';
import { buildPage, decodeCursor, toSlug, uniqueSlug } from 'src/common/utils';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePlaceDto, PlaceExperiencesQueryDto, SearchPlacesDto } from './dto/place.dto';
import { PlaceDetailDto, PlaceSummaryDto } from './dto/place-response.dto';
import { PLACE_SUMMARY_SELECT, PlaceAggregatesService } from './place-aggregates.service';

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregates: PlaceAggregatesService,
    private readonly visibility: VisibilityService,
  ) {}

  /**
   * Type-ahead for the trip wizard. Ranks exact prefix matches above
   * substring matches, then by how many people have been there.
   */
  async search(query: SearchPlacesDto): Promise<{
    items: PlaceSummaryDto[];
    total: number;
    hasMore: boolean;
    nextCursor: null;
  }> {
    const where: Prisma.PlaceWhereInput = {
      ...(query.countryCode ? { countryCode: query.countryCode } : {}),
      ...(query.state ? { state: { equals: query.state, mode: 'insensitive' } } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.destinationsOnly ? { isDestination: true } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { region: { contains: query.q, mode: 'insensitive' } },
              { city: { contains: query.q, mode: 'insensitive' } },
              { state: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.place.findMany({
        where,
        select: PLACE_SUMMARY_SELECT,
        orderBy: [{ experienceCount: 'desc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.place.count({ where }),
    ]);

    const items = query.q ? this.rankByPrefix(rows, query.q) : rows;

    return {
      items,
      total,
      hasMore: query.skip + rows.length < total,
      nextCursor: null,
    };
  }

  async findOne(idOrSlug: string): Promise<PlaceDetailDto> {
    const place = await this.prisma.place.findFirst({
      where: UUID_RE.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
      include: { parent: { select: PLACE_SUMMARY_SELECT } },
    });
    if (!place) throw new NotFoundException('Place not found');

    const [aggregates, realityChecks] = await Promise.all([
      this.aggregates.forPlace(place.id),
      this.prisma.realityCheck.findMany({
        where: {
          placeId: place.id,
          trip: { status: TripStatus.PUBLISHED, deletedAt: null, visibility: 'PUBLIC' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, severity: true, text: true, createdAt: true },
      }),
    ]);

    return {
      id: place.id,
      slug: place.slug,
      name: place.name,
      countryCode: place.countryCode,
      country: place.country,
      state: place.state,
      region: place.region,
      city: place.city,
      category: place.category,
      coverImage: place.coverImage,
      latitude: place.latitude,
      longitude: place.longitude,
      description: place.description,
      isVerified: place.isVerified,
      experienceCount: aggregates.experienceCount,
      parent: place.parent,
      aggregates,
      realityChecks,
    };
  }

  /**
   * "Show me everyone who visited Cola Beach" (spec §10) — the query the
   * canonical Place model exists to make possible.
   */
  async experiences(idOrSlug: string, query: PlaceExperiencesQueryDto, viewerId?: string) {
    const place = await this.prisma.place.findFirst({
      where: UUID_RE.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
      select: { id: true },
    });
    if (!place) throw new NotFoundException('Place not found');

    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.trip.findMany({
      where: {
        deletedAt: null,
        status: TripStatus.PUBLISHED,
        places: { some: { placeId: place.id } },
        AND: [
          this.visibility.visibilityFilter(viewerId),
          this.visibility.blockFilter(viewerId),
          ...(query.month ? [monthFilter(query.month)] : []),
        ],
        ...(cursor ? { publishedAt: { lt: new Date(cursor.v) } } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: query.limit + 1,
      select: TRIP_CARD_SELECT,
    });

    return buildPage(rows, query.limit, (r) => r.publishedAt ?? r.createdAt);
  }

  /**
   * Find-or-create by (name, country, state). Trips must reference canonical
   * places, but the wizard cannot require every beach to pre-exist, so a place
   * the user types is created once and reused by everyone after them.
   */
  async findOrCreate(dto: CreatePlaceDto): Promise<PlaceSummaryDto> {
    const existing = await this.prisma.place.findFirst({
      where: {
        name: { equals: dto.name, mode: 'insensitive' },
        countryCode: dto.countryCode,
        ...(dto.state ? { state: { equals: dto.state, mode: 'insensitive' } } : {}),
      },
      select: PLACE_SUMMARY_SELECT,
    });
    if (existing) return existing;

    return this.prisma.place.create({
      data: {
        ...dto,
        slug: await this.buildSlug(dto.name, dto.state ?? dto.country),
      },
      select: PLACE_SUMMARY_SELECT,
    });
  }

  /** Trending destinations for the empty Explore state. */
  async popular(limit = 12): Promise<PlaceSummaryDto[]> {
    return this.prisma.place.findMany({
      where: { experienceCount: { gt: 0 } },
      orderBy: [{ experienceCount: 'desc' }, { travelerCount: 'desc' }],
      take: limit,
      select: PLACE_SUMMARY_SELECT,
    });
  }

  /** Distinct countries/states that have published trips, for filter dropdowns. */
  async destinations(countryCode?: string) {
    const rows = await this.prisma.trip.groupBy({
      by: ['countryCode', 'country', 'state'],
      where: {
        status: TripStatus.PUBLISHED,
        deletedAt: null,
        visibility: 'PUBLIC',
        ...(countryCode ? { countryCode } : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return rows.map((r) => ({
      countryCode: r.countryCode,
      country: r.country,
      state: r.state,
      tripCount: r._count._all,
    }));
  }

  private async buildSlug(name: string, qualifier?: string): Promise<string> {
    const base = qualifier ? toSlug(`${name}-${qualifier}`) : toSlug(name);
    const taken = await this.prisma.place.findUnique({ where: { slug: base }, select: { id: true } });
    return taken ? uniqueSlug(base) : base;
  }

  private rankByPrefix(rows: PlaceSummaryDto[], q: string): PlaceSummaryDto[] {
    const needle = q.toLowerCase();
    return [...rows].sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return b.experienceCount - a.experienceCount;
    });
  }
}

/** Trips starting in a given month, across all years (spec §30). */
function monthFilter(month: number): Prisma.TripWhereInput {
  return { startMonth: month };
}

export const TRIP_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  country: true,
  countryCode: true,
  state: true,
  destination: true,
  startDate: true,
  endDate: true,
  nights: true,
  days: true,
  travelerCount: true,
  totalExpense: true,
  currency: true,
  expenseVisibility: true,
  travelStyles: true,
  visibility: true,
  placeCount: true,
  photoCount: true,
  saveCount: true,
  viewCount: true,
  season: true,
  publishedAt: true,
  createdAt: true,
  user: { select: { id: true, username: true, name: true, profileImage: true } },
  coverMedia: { select: { id: true, url: true, thumbnailUrl: true, blurhash: true } },
} satisfies Prisma.TripSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
