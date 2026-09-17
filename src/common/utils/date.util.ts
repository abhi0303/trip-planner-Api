import { Season } from '@prisma/client';

/**
 * Trip duration rules (spec §6, "Need clear business rules for nights/days").
 *
 *   nights = calendar days between check-out and check-in
 *   days   = nights + 1
 *
 * 12 Aug -> 15 Aug is 3 nights / 4 days. A same-day trip is 0 nights / 1 day.
 *
 * Note the spec's example label "4 nights / 3 days" is inverted — a stay always
 * spans one more day than it does nights — so the API returns nights=3, days=4
 * for 12-15 Aug and FE should render "3 nights • 4 days".
 */
export function calculateDuration(startDate: Date, endDate: Date): { nights: number; days: number } {
  const start = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return { nights, days: nights + 1 };
}

export function toUtcMidnight(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Season derived from the start date (spec §15). India-centric calendar, since
 * that is the launch market; `countryCode` is accepted so the mapping can be
 * regionalised later without changing callers.
 */
export function deriveSeason(startDate: Date, countryCode = 'IN'): Season {
  const month = toUtcMidnight(startDate).getUTCMonth() + 1;

  if (countryCode === 'IN') {
    if (month === 12 || month <= 2) return Season.WINTER;
    if (month <= 4) return Season.SPRING;
    if (month <= 6) return Season.SUMMER;
    if (month <= 9) return Season.MONSOON;
    return Season.AUTUMN;
  }

  // Northern-hemisphere default.
  if (month === 12 || month <= 2) return Season.WINTER;
  if (month <= 5) return Season.SPRING;
  if (month <= 8) return Season.SUMMER;
  return Season.AUTUMN;
}

/** Nights between two dates, used for stay validation. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((toUtcMidnight(checkOut).getTime() - toUtcMidnight(checkIn).getTime()) / 86_400_000);
}

export function isDateWithin(date: Date, start: Date, end: Date): boolean {
  const d = toUtcMidnight(date).getTime();
  return d >= toUtcMidnight(start).getTime() && d <= toUtcMidnight(end).getTime();
}
