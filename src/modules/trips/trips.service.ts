import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseMode, Prisma, TripStatus, Visibility } from '@prisma/client';
import { VisibilityService } from 'src/common/services/visibility.service';
import {
  buildPage,
  calculateDuration,
  decodeCursor,
  deriveSeason,
  round2,
  toNumber,
  uniqueSlug,
} from 'src/common/utils';
import {
  PLACE_SUMMARY_SELECT,
  PlaceAggregatesService,
} from 'src/modules/places/place-aggregates.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripCardDto, TripDetailDto } from './dto/trip-response.dto';
import { TripQueryDto } from './dto/trip-query.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { ExpensesService } from './expenses.service';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesService,
    private readonly visibility: VisibilityService,
    private readonly placeAggregates: PlaceAggregatesService,
  ) {}

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  async create(userId: string, dto: CreateTripDto): Promise<TripDetailDto> {
    await this.assertOwnsMedia(userId, dto.coverMediaId);
    const { startDate, endDate } = this.parseDates(dto.startDate, dto.endDate);
    const { nights, days } = calculateDuration(startDate, endDate);

    const travelers = this.travelerCount(dto);
    this.assertExpenseMode(dto.expenseMode, dto.totalExpense);

    const trip = await this.prisma.trip.create({
      data: {
        userId,
        title: dto.title,
        slug: uniqueSlug(dto.title),
        countryCode: dto.countryCode,
        country: dto.country,
        state: dto.state,
        destination: dto.destination,
        destinationId: dto.destinationId,
        startDate,
        endDate,
        nights,
        days,
        startMonth: startDate.getUTCMonth() + 1,
        startYear: startDate.getUTCFullYear(),
        adults: dto.adults ?? 1,
        children: dto.children ?? 0,
        infants: dto.infants ?? 0,
        travelerCount: travelers,
        expenseMode: dto.expenseMode ?? ExpenseMode.TOTAL,
        totalExpense: dto.totalExpense !== undefined ? new Prisma.Decimal(dto.totalExpense) : null,
        currency: dto.currency ?? 'INR',
        travelStyles: dto.travelStyles ?? [],
        weather: dto.weather,
        crowdLevel: dto.crowdLevel,
        // Season is derived from the dates rather than asked for (spec §15).
        season: deriveSeason(startDate, dto.countryCode),
        visibility: dto.visibility ?? Visibility.PUBLIC,
        expenseVisibility: dto.expenseVisibility ?? Visibility.PUBLIC,
        experience: dto.experience,
        enjoyedMost: dto.enjoyedMost,
        surprisedBy: dto.surprisedBy,
        wentWrong: dto.wentWrong,
        wouldDoDifferently: dto.wouldDoDifferently,
        adviceForTravelers: dto.adviceForTravelers,
        coverMediaId: dto.coverMediaId,
        status: TripStatus.DRAFT,
      },
      select: { id: true },
    });

    return this.findOne(trip.id, userId);
  }

  async update(tripId: string, userId: string, dto: UpdateTripDto): Promise<TripDetailDto> {
    const existing = await this.assertOwner(tripId, userId);
    await this.assertOwnsMedia(userId, dto.coverMediaId);

    // Dates can be edited one at a time, so re-derive from the merged pair.
    const startDate = dto.startDate
      ? this.parseDate(dto.startDate, 'startDate')
      : existing.startDate;
    const endDate = dto.endDate ? this.parseDate(dto.endDate, 'endDate') : existing.endDate;
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const { nights, days } = calculateDuration(startDate, endDate);

    const expenseMode = dto.expenseMode ?? existing.expenseMode;
    if (dto.expenseMode || dto.totalExpense !== undefined) {
      this.assertExpenseMode(
        expenseMode,
        dto.totalExpense ?? (toNumber(existing.totalExpense) || undefined),
      );
    }

    const travelers =
      dto.adults !== undefined || dto.children !== undefined || dto.infants !== undefined
        ? (dto.adults ?? existing.adults) +
          (dto.children ?? existing.children) +
          (dto.infants ?? existing.infants)
        : existing.travelerCount;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        title: dto.title,
        countryCode: dto.countryCode,
        country: dto.country,
        state: dto.state,
        destination: dto.destination,
        destinationId: dto.destinationId,
        startDate,
        endDate,
        nights,
        days,
        startMonth: startDate.getUTCMonth() + 1,
        startYear: startDate.getUTCFullYear(),
        adults: dto.adults,
        children: dto.children,
        infants: dto.infants,
        travelerCount: travelers,
        expenseMode: dto.expenseMode,
        totalExpense:
          dto.totalExpense !== undefined ? new Prisma.Decimal(dto.totalExpense) : undefined,
        currency: dto.currency,
        travelStyles: dto.travelStyles,
        weather: dto.weather,
        crowdLevel: dto.crowdLevel,
        season: deriveSeason(startDate, dto.countryCode ?? existing.countryCode),
        visibility: dto.visibility,
        expenseVisibility: dto.expenseVisibility,
        experience: dto.experience,
        enjoyedMost: dto.enjoyedMost,
        surprisedBy: dto.surprisedBy,
        wentWrong: dto.wentWrong,
        wouldDoDifferently: dto.wouldDoDifferently,
        adviceForTravelers: dto.adviceForTravelers,
        coverMediaId: dto.coverMediaId,
      },
    });

    // Switching into DETAILED mode makes the line items authoritative.
    if (dto.expenseMode === ExpenseMode.DETAILED) await this.expenses.syncTripTotal(tripId);

    return this.findOne(tripId, userId);
  }

  /**
   * Publishing is the point at which a trip becomes part of the public data
   * set, so the minimum-quality checks live here rather than on create.
   */
  async publish(tripId: string, userId: string): Promise<TripDetailDto> {
    const trip = await this.assertOwner(tripId, userId);

    const problems: string[] = [];
    const placeCount = await this.prisma.tripPlace.count({ where: { tripId } });
    if (placeCount === 0) problems.push('Add at least one place you visited');
    if (trip.expenseMode === ExpenseMode.TOTAL && trip.totalExpense === null) {
      problems.push('Add the total trip expense, or switch to detailed expenses');
    }
    if (trip.expenseMode === ExpenseMode.DETAILED) {
      const count = await this.prisma.tripExpense.count({ where: { tripId } });
      if (count === 0) problems.push('Add at least one expense line item');
    }

    if (problems.length) {
      throw new BadRequestException({
        code: 'TRIP_INCOMPLETE',
        message: 'This trip is not ready to publish',
        details: { problems },
      });
    }

    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: tripId },
        data: {
          status: TripStatus.PUBLISHED,
          publishedAt: trip.publishedAt ?? new Date(),
        },
      }),
      ...(trip.status === TripStatus.PUBLISHED
        ? []
        : [
            this.prisma.user.update({
              where: { id: userId },
              data: { tripCount: { increment: 1 } },
            }),
          ]),
    ]);

    await this.refreshPlaceAggregates(tripId);
    return this.findOne(tripId, userId);
  }

  async unpublish(tripId: string, userId: string): Promise<TripDetailDto> {
    const trip = await this.assertOwner(tripId, userId);

    if (trip.status === TripStatus.PUBLISHED) {
      await this.prisma.$transaction([
        this.prisma.trip.update({ where: { id: tripId }, data: { status: TripStatus.DRAFT } }),
        this.prisma.user.update({
          where: { id: userId },
          data: { tripCount: { decrement: 1 } },
        }),
      ]);
      await this.refreshPlaceAggregates(tripId);
    }

    return this.findOne(tripId, userId);
  }

  async remove(tripId: string, userId: string): Promise<{ message: string }> {
    const trip = await this.assertOwner(tripId, userId);

    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: tripId },
        data: { deletedAt: new Date(), status: TripStatus.ARCHIVED },
      }),
      ...(trip.status === TripStatus.PUBLISHED
        ? [
            this.prisma.user.update({
              where: { id: userId },
              data: { tripCount: { decrement: 1 } },
            }),
          ]
        : []),
    ]);

    await this.refreshPlaceAggregates(tripId);
    return { message: 'Trip deleted' };
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async findOne(idOrSlug: string, viewerId?: string): Promise<TripDetailDto> {
    const trip = await this.prisma.trip.findFirst({
      where: {
        ...(UUID_RE.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }),
        deletedAt: null,
      },
      include: TRIP_DETAIL_INCLUDE,
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const isOwner = viewerId === trip.userId;

    // Drafts are private to their author regardless of the visibility setting.
    if (!isOwner && trip.status !== TripStatus.PUBLISHED) {
      throw new NotFoundException('Trip not found');
    }
    if (!(await this.visibility.canView(viewerId, { id: trip.userId }, trip.visibility))) {
      throw new NotFoundException('Trip not found');
    }
    if (viewerId && !isOwner && (await this.visibility.isBlockedEitherWay(viewerId, trip.userId))) {
      throw new NotFoundException('Trip not found');
    }

    const canSeeExpenses = await this.visibility.canViewExpenses(
      viewerId,
      { id: trip.userId },
      trip.expenseVisibility,
    );

    const [expenseSummary, isSaved] = await Promise.all([
      canSeeExpenses ? this.expenses.summary(trip.id) : Promise.resolve(null),
      viewerId
        ? this.prisma.save
            .findUnique({
              where: { userId_tripId: { userId: viewerId, tripId: trip.id } },
              select: { id: true },
            })
            .then(Boolean)
        : Promise.resolve(null),
    ]);

    return this.toDetail(trip, { isOwner, canSeeExpenses, expenseSummary, isSaved, viewerId });
  }

  /** Feed/profile/explore listing with filters (spec §25, §31). */
  async list(query: TripQueryDto, viewerId?: string) {
    const cursor = decodeCursor(query.cursor);

    const where: Prisma.TripWhereInput = {
      deletedAt: null,
      status: TripStatus.PUBLISHED,
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.countryCode ? { countryCode: query.countryCode } : {}),
      ...(query.state ? { state: { equals: query.state, mode: 'insensitive' } } : {}),
      ...(query.destinationId ? { destinationId: query.destinationId } : {}),
      ...(query.placeId ? { places: { some: { placeId: query.placeId } } } : {}),
      ...(query.month ? { startMonth: query.month } : {}),
      ...(query.season ? { season: query.season } : {}),
      ...(query.travelerCount ? { travelerCount: query.travelerCount } : {}),
      ...(query.travelStyles?.length ? { travelStyles: { hasSome: query.travelStyles } } : {}),
      ...(query.minDays || query.maxDays
        ? {
            days: {
              ...(query.minDays ? { gte: query.minDays } : {}),
              ...(query.maxDays ? { lte: query.maxDays } : {}),
            },
          }
        : {}),
      // Budget filters only match trips that made their spending public —
      // otherwise a hidden number would still be searchable.
      ...(query.minBudget || query.maxBudget
        ? {
            expenseVisibility: Visibility.PUBLIC,
            totalExpense: {
              ...(query.minBudget ? { gte: new Prisma.Decimal(query.minBudget) } : {}),
              ...(query.maxBudget ? { lte: new Prisma.Decimal(query.maxBudget) } : {}),
            },
          }
        : {}),
      AND: [this.visibility.visibilityFilter(viewerId), this.visibility.blockFilter(viewerId)],
      ...(cursor ? this.cursorFilter(query.sort, cursor.v) : {}),
    };

    const rows = await this.prisma.trip.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      take: query.limit + 1,
      select: TRIP_CARD_SELECT,
    });

    const page = buildPage(rows, query.limit, (r) =>
      query.sort === 'popular' ? r.saveCount : (r.publishedAt ?? r.createdAt),
    );

    return { ...page, items: await this.toCards(page.items, viewerId) };
  }

  /** Drafts + published trips of the signed-in user, including private ones. */
  async listMine(userId: string, query: TripQueryDto) {
    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.trip.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(cursor ? { createdAt: { lt: new Date(cursor.v) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      select: { ...TRIP_CARD_SELECT, status: true },
    });

    const page = buildPage(rows, query.limit, (r) => r.createdAt);
    return { ...page, items: await this.toCards(page.items, userId) };
  }

  /** Fire-and-forget view counter; not part of the response contract. */
  async recordView(tripId: string, viewerId?: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { userId: true },
    });
    if (!trip || trip.userId === viewerId) return;
    await this.prisma.trip.update({ where: { id: tripId }, data: { viewCount: { increment: 1 } } });
  }

  // -------------------------------------------------------------------------
  // Helpers shared with the section services
  // -------------------------------------------------------------------------

  /**
   * The cover is set by media id, so without this anyone could point their
   * trip cover at someone else's upload.
   */
  private async assertOwnsMedia(userId: string, mediaId?: string | null): Promise<void> {
    if (!mediaId) return;

    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, userId },
      select: { id: true },
    });
    if (!media) {
      throw new BadRequestException('coverMediaId must be an image you uploaded');
    }
  }

  /** Throws 404 for non-existent and 403 for someone else's trip. */
  async assertOwner(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.userId !== userId) throw new ForbiddenException('You can only edit your own trips');
    return trip;
  }

  /** Recomputes cached place stats for every place on the trip. */
  async refreshPlaceAggregates(tripId: string): Promise<void> {
    const places = await this.prisma.tripPlace.findMany({
      where: { tripId },
      select: { placeId: true },
    });
    await this.placeAggregates.refreshCache(places.map((p) => p.placeId));
  }

  /** Keeps the denormalised place/photo counters on the trip row correct. */
  async refreshCounters(tripId: string): Promise<void> {
    const [placeCount, photoCount] = await this.prisma.$transaction([
      this.prisma.tripPlace.count({ where: { tripId } }),
      this.prisma.tripPhoto.count({ where: { tripId } }),
    ]);
    await this.prisma.trip.update({ where: { id: tripId }, data: { placeCount, photoCount } });
  }

  /** Maps rows to cards, masking spend the viewer may not see. */
  async toCards(rows: any[], viewerId?: string): Promise<TripCardDto[]> {
    if (!rows.length) return [];

    const savedIds = viewerId
      ? new Set(
          (
            await this.prisma.save.findMany({
              where: { userId: viewerId, tripId: { in: rows.map((r) => r.id) } },
              select: { tripId: true },
            })
          ).map((s) => s.tripId as string),
        )
      : null;

    // One relationship lookup for the whole page rather than per row.
    const authorIds = [...new Set(rows.map((r) => r.user.id))].filter((id) => id !== viewerId);
    const followed =
      viewerId && authorIds.length
        ? new Set(
            (
              await this.prisma.follow.findMany({
                where: { followerId: viewerId, followingId: { in: authorIds } },
                select: { followingId: true },
              })
            ).map((f) => f.followingId),
          )
        : new Set<string>();

    const mutuals = viewerId
      ? new Set(
          (
            await this.prisma.follow.findMany({
              where: { followingId: viewerId, followerId: { in: authorIds } },
              select: { followerId: true },
            })
          ).map((f) => f.followerId),
        )
      : new Set<string>();

    return rows.map((trip) => {
      const visible = this.canSeeExpensesSync(trip, viewerId, followed, mutuals);
      const total = visible ? toNumber(trip.totalExpense) : null;

      return {
        id: trip.id,
        slug: trip.slug,
        title: trip.title,
        country: trip.country,
        countryCode: trip.countryCode,
        state: trip.state,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        nights: trip.nights,
        days: trip.days,
        travelerCount: trip.travelerCount,
        totalExpense: total,
        perPerson: total === null ? null : round2(total / Math.max(trip.travelerCount, 1)),
        currency: trip.currency,
        travelStyles: trip.travelStyles,
        season: trip.season,
        placeCount: trip.placeCount,
        photoCount: trip.photoCount,
        saveCount: trip.saveCount,
        visibility: trip.visibility,
        user: {
          ...trip.user,
          isFollowing: viewerId
            ? trip.user.id === viewerId
              ? null
              : followed.has(trip.user.id)
            : null,
        },
        coverMedia: trip.coverMedia,
        isSaved: savedIds ? savedIds.has(trip.id) : null,
        publishedAt: trip.publishedAt,
        ...(trip.status ? { status: trip.status } : {}),
      };
    });
  }

  /**
   * Card-level expense check using relationships already loaded for the page,
   * so a 20-trip feed does not issue 20 follow lookups.
   */
  private canSeeExpensesSync(
    trip: { userId?: string; user: { id: string }; expenseVisibility: Visibility },
    viewerId: string | undefined,
    followed: Set<string>,
    mutuals: Set<string>,
  ): boolean {
    const authorId = trip.user.id;
    if (viewerId === authorId) return true;
    switch (trip.expenseVisibility) {
      case Visibility.PUBLIC:
        return true;
      case Visibility.FOLLOWERS:
        return !!viewerId && followed.has(authorId);
      case Visibility.FRIENDS:
        return !!viewerId && followed.has(authorId) && mutuals.has(authorId);
      default:
        return false;
    }
  }

  private toDetail(
    trip: any,
    ctx: {
      isOwner: boolean;
      canSeeExpenses: boolean;
      expenseSummary: any;
      isSaved: boolean | null;
      viewerId?: string;
    },
  ): TripDetailDto {
    const total = ctx.canSeeExpenses ? toNumber(trip.totalExpense) : null;

    return {
      id: trip.id,
      slug: trip.slug,
      title: trip.title,
      country: trip.country,
      countryCode: trip.countryCode,
      state: trip.state,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      nights: trip.nights,
      days: trip.days,
      travelerCount: trip.travelerCount,
      adults: trip.adults,
      children: trip.children,
      infants: trip.infants,
      totalExpense: total,
      perPerson: total === null ? null : round2(total / Math.max(trip.travelerCount, 1)),
      currency: trip.currency,
      travelStyles: trip.travelStyles,
      season: trip.season,
      weather: trip.weather,
      crowdLevel: trip.crowdLevel,
      status: trip.status,
      visibility: trip.visibility,
      expenseVisibility: trip.expenseVisibility,
      experience: trip.experience,
      enjoyedMost: trip.enjoyedMost,
      surprisedBy: trip.surprisedBy,
      wentWrong: trip.wentWrong,
      wouldDoDifferently: trip.wouldDoDifferently,
      adviceForTravelers: trip.adviceForTravelers,
      expenses: ctx.expenseSummary,
      placeCount: trip.placeCount,
      photoCount: trip.photoCount,
      saveCount: trip.saveCount,
      viewCount: trip.viewCount,
      user: trip.user,
      coverMedia: trip.coverMedia,
      isSaved: ctx.isSaved,
      isOwner: ctx.isOwner,
      places: trip.places.map((tp: any) => ({
        id: tp.id,
        place: tp.place,
        visitDate: tp.visitDate,
        sequence: tp.sequence,
        durationMinutes: tp.durationMinutes,
        notes: tp.notes,
      })),
      stays: trip.stays.map((s: any) => ({
        id: s.id,
        hotelName: s.hotelName,
        place: s.place,
        location: s.location,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        nights: s.nights,
        // A stay's price is spending too — mask it with the same rule.
        amount: ctx.canSeeExpenses ? toNumber(s.amount) : null,
        currency: s.currency,
        roomType: s.roomType,
        rating: s.rating,
        bookingPlatform: s.bookingPlatform,
        websiteUrl: s.websiteUrl,
        notes: s.notes,
      })),
      photos: trip.photos.map((p: any) => ({
        id: p.id,
        media: p.media,
        place: p.place,
        caption: p.caption,
        takenAt: p.takenAt,
        sequence: p.sequence,
        // Derived rather than stored: trips.coverMediaId stays the single
        // source of truth, so there is no way for two photos to claim it.
        isCover: !!trip.coverMediaId && p.mediaId === trip.coverMediaId,
      })),
      ratings: this.groupRatings(trip.ratings),
      realityChecks: trip.realityChecks,
      itinerary: trip.days_.map((d: any) => ({
        id: d.id,
        dayNumber: d.dayNumber,
        date: d.date,
        title: d.title,
        summary: d.summary,
        activities: d.activities,
      })),
      publishedAt: trip.publishedAt,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    };
  }

  /** Flat rating rows → one group per rated target. */
  private groupRatings(rows: any[]) {
    const groups = new Map<string, any>();

    for (const r of rows) {
      const key = `${r.ratingType}:${r.placeId ?? ''}:${r.stayId ?? ''}`;
      const group = groups.get(key) ?? {
        ratingType: r.ratingType,
        place: r.place ?? null,
        stayId: r.stayId ?? null,
        scores: {} as Record<string, number>,
        average: 0,
      };
      group.scores[r.criteria] = r.score;
      groups.set(key, group);
    }

    return [...groups.values()].map((g) => {
      const scores = Object.values(g.scores) as number[];
      return { ...g, average: round2(scores.reduce((a, b) => a + b, 0) / scores.length) };
    });
  }

  private orderBy(sort?: string): Prisma.TripOrderByWithRelationInput[] {
    switch (sort) {
      case 'popular':
        return [{ saveCount: 'desc' }, { publishedAt: 'desc' }];
      case 'budget_low':
        return [{ totalExpense: 'asc' }, { publishedAt: 'desc' }];
      case 'budget_high':
        return [{ totalExpense: 'desc' }, { publishedAt: 'desc' }];
      case 'oldest':
        return [{ publishedAt: 'asc' }];
      default:
        return [{ publishedAt: 'desc' }];
    }
  }

  private cursorFilter(sort: string | undefined, value: string): Prisma.TripWhereInput {
    switch (sort) {
      case 'popular':
        return { saveCount: { lt: Number(value) } };
      case 'oldest':
        return { publishedAt: { gt: new Date(value) } };
      case 'budget_low':
      case 'budget_high':
        // Budget sorts page by date to keep the cursor stable when two trips
        // share a total.
        return { publishedAt: { lt: new Date(value) } };
      default:
        return { publishedAt: { lt: new Date(value) } };
    }
  }

  private travelerCount(dto: CreateTripDto): number {
    return (dto.adults ?? 1) + (dto.children ?? 0) + (dto.infants ?? 0);
  }

  private parseDates(start: string, end: string) {
    const startDate = this.parseDate(start, 'startDate');
    const endDate = this.parseDate(end, 'endDate');
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    if (calculateDuration(startDate, endDate).nights > 365) {
      throw new BadRequestException('A trip cannot be longer than 365 nights');
    }
    return { startDate, endDate };
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} is not a valid date`);
    }
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private assertExpenseMode(mode: ExpenseMode | undefined, totalExpense?: number): void {
    if ((mode ?? ExpenseMode.TOTAL) === ExpenseMode.TOTAL && totalExpense === undefined) {
      // Not fatal at draft time — publish() enforces it.
      return;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  season: true,
  visibility: true,
  placeCount: true,
  photoCount: true,
  saveCount: true,
  publishedAt: true,
  createdAt: true,
  user: { select: { id: true, username: true, name: true, profileImage: true } },
  coverMedia: {
    select: { id: true, url: true, thumbnailUrl: true, blurhash: true, width: true, height: true },
  },
} satisfies Prisma.TripSelect;

const MEDIA_SELECT = {
  id: true,
  url: true,
  thumbnailUrl: true,
  blurhash: true,
  width: true,
  height: true,
} satisfies Prisma.MediaSelect;

export const TRIP_DETAIL_INCLUDE = {
  user: { select: { id: true, username: true, name: true, profileImage: true } },
  coverMedia: { select: MEDIA_SELECT },
  places: {
    orderBy: { sequence: 'asc' },
    include: { place: { select: PLACE_SUMMARY_SELECT } },
  },
  stays: {
    orderBy: { checkIn: 'asc' },
    include: { place: { select: PLACE_SUMMARY_SELECT } },
  },
  photos: {
    orderBy: { sequence: 'asc' },
    include: { media: { select: MEDIA_SELECT }, place: { select: PLACE_SUMMARY_SELECT } },
  },
  ratings: { include: { place: { select: PLACE_SUMMARY_SELECT } } },
  realityChecks: { include: { place: { select: PLACE_SUMMARY_SELECT } } },
  days_: {
    orderBy: { dayNumber: 'asc' },
    include: {
      activities: {
        orderBy: { sequence: 'asc' },
        include: { place: { select: PLACE_SUMMARY_SELECT } },
      },
    },
  },
} satisfies Prisma.TripInclude;
