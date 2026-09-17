import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TravelStyle, TripStatus, Visibility } from '@prisma/client';
import { round2, toNumber } from 'src/common/utils';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlaceAggregatesDto } from './dto/place-response.dto';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Aggregate travel data for a place (spec §24, §30).
 *
 * Only PUBLIC + PUBLISHED trips feed the statistics: aggregates are shown to
 * everyone, so including follower-only trips would leak them indirectly.
 * Spend figures additionally require expenseVisibility = PUBLIC (spec §33).
 */
@Injectable()
export class PlaceAggregatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get minSampleSize(): number {
    return this.config.get<number>('minSampleSize') ?? 3;
  }

  async forPlace(placeId: string): Promise<PlaceAggregatesDto> {
    const tripFilter: Prisma.TripWhereInput = {
      deletedAt: null,
      status: TripStatus.PUBLISHED,
      visibility: Visibility.PUBLIC,
      places: { some: { placeId } },
    };

    const [trips, ratingRows, visitStats] = await Promise.all([
      this.prisma.trip.findMany({
        where: tripFilter,
        select: {
          id: true,
          userId: true,
          startDate: true,
          days: true,
          travelerCount: true,
          totalExpense: true,
          expenseVisibility: true,
          travelStyles: true,
          places: { select: { placeId: true } },
        },
      }),
      this.prisma.tripRating.groupBy({
        by: ['criteria'],
        where: { placeId, trip: tripFilter },
        _avg: { score: true },
        _count: { score: true },
      }),
      this.prisma.tripPlace.aggregate({
        where: { placeId, durationMinutes: { not: null }, trip: tripFilter },
        _avg: { durationMinutes: true },
      }),
    ]);

    const experienceCount = trips.length;
    const travelerCount = new Set(trips.map((t) => t.userId)).size;
    const hasEnoughData = experienceCount >= this.minSampleSize;

    const ratingBreakdown = ratingRows
      .map((r) => ({
        criteria: r.criteria as string,
        average: round2(r._avg.score ?? 0),
        count: r._count.score,
      }))
      .sort((a, b) => b.count - a.count);

    const overall = ratingBreakdown.length
      ? round2(
          ratingBreakdown.reduce((sum, r) => sum + r.average * r.count, 0) /
            ratingBreakdown.reduce((sum, r) => sum + r.count, 0),
        )
      : null;

    // Per-person spend, only from trips that made their expenses public.
    const spendSamples = trips
      .filter((t) => t.expenseVisibility === Visibility.PUBLIC && t.totalExpense != null)
      .map((t) => toNumber(t.totalExpense) / Math.max(t.travelerCount, 1));

    const styleCounts = new Map<TravelStyle, number>();
    const monthCounts = new Array(12).fill(0);
    const pairedCounts = new Map<string, number>();

    for (const trip of trips) {
      for (const style of trip.travelStyles) {
        styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
      }
      monthCounts[trip.startDate.getUTCMonth()] += 1;
      for (const p of trip.places) {
        if (p.placeId !== placeId) pairedCounts.set(p.placeId, (pairedCounts.get(p.placeId) ?? 0) + 1);
      }
    }

    const topPairedIds = [...pairedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);

    const paired = topPairedIds.length
      ? await this.prisma.place.findMany({
          where: { id: { in: topPairedIds } },
          select: PLACE_SUMMARY_SELECT,
        })
      : [];

    return {
      experienceCount,
      travelerCount,
      hasEnoughData,
      minSampleSize: this.minSampleSize,
      // Averages stay null below the sample threshold so FE cannot accidentally
      // render "4.9 ★" off a single trip.
      avgRating: hasEnoughData ? overall : null,
      ratingBreakdown: hasEnoughData ? ratingBreakdown : [],
      avgVisitMinutes: hasEnoughData && visitStats._avg.durationMinutes
        ? Math.round(visitStats._avg.durationMinutes)
        : null,
      avgSpendPerPerson:
        hasEnoughData && spendSamples.length >= this.minSampleSize
          ? round2(spendSamples.reduce((a, b) => a + b, 0) / spendSamples.length)
          : null,
      avgTripDays: hasEnoughData
        ? round2(trips.reduce((sum, t) => sum + t.days, 0) / experienceCount)
        : null,
      popularTravelStyles: [...styleCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([style]) => style),
      monthlyDistribution: monthCounts.map((count, i) => ({
        month: i + 1,
        label: MONTH_LABELS[i],
        experienceCount: count,
      })),
      frequentlyPairedWith: paired.sort(
        (a, b) => (pairedCounts.get(b.id) ?? 0) - (pairedCounts.get(a.id) ?? 0),
      ),
    };
  }

  /**
   * Refreshes the cached counters on the Place row. Called after a trip is
   * published or deleted; cheap enough to run inline today, and the obvious
   * thing to move to a queue once volume grows.
   */
  async refreshCache(placeIds: string[]): Promise<void> {
    for (const placeId of [...new Set(placeIds)]) {
      const agg = await this.forPlace(placeId);
      await this.prisma.place.update({
        where: { id: placeId },
        data: {
          experienceCount: agg.experienceCount,
          travelerCount: agg.travelerCount,
          avgRating: agg.avgRating,
          avgVisitMinutes: agg.avgVisitMinutes,
          avgSpendPerPerson: agg.avgSpendPerPerson,
          aggregatesAt: new Date(),
        },
      });
    }
  }
}

export const PLACE_SUMMARY_SELECT = {
  id: true,
  slug: true,
  name: true,
  countryCode: true,
  country: true,
  state: true,
  region: true,
  category: true,
  coverImage: true,
  latitude: true,
  longitude: true,
  experienceCount: true,
} satisfies Prisma.PlaceSelect;
