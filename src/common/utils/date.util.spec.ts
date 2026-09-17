import { Season } from '@prisma/client';
import { calculateDuration, deriveSeason, isDateWithin, nightsBetween } from './date.util';

describe('calculateDuration', () => {
  it('derives 3 nights / 4 days for 12-15 Aug (the spec example)', () => {
    expect(calculateDuration(new Date('2026-08-12'), new Date('2026-08-15'))).toEqual({
      nights: 3,
      days: 4,
    });
  });

  it('treats a same-day trip as 0 nights / 1 day', () => {
    expect(calculateDuration(new Date('2026-08-12'), new Date('2026-08-12'))).toEqual({
      nights: 0,
      days: 1,
    });
  });

  it('is unaffected by the time component', () => {
    expect(
      calculateDuration(new Date('2026-08-12T23:59:00Z'), new Date('2026-08-15T00:01:00Z')),
    ).toEqual({ nights: 3, days: 4 });
  });

  it('counts across a month boundary', () => {
    expect(calculateDuration(new Date('2026-08-30'), new Date('2026-09-02')).nights).toBe(3);
  });

  it('counts across a leap day', () => {
    expect(calculateDuration(new Date('2028-02-27'), new Date('2028-03-01')).nights).toBe(3);
  });
});

describe('deriveSeason', () => {
  it.each([
    ['2026-08-12', Season.MONSOON],
    ['2026-01-10', Season.WINTER],
    ['2026-12-20', Season.WINTER],
    ['2026-03-15', Season.SPRING],
    ['2026-05-02', Season.SUMMER],
    ['2026-10-30', Season.AUTUMN],
  ])('maps %s to %s in India', (date, expected) => {
    expect(deriveSeason(new Date(date), 'IN')).toBe(expected);
  });

  it('falls back to a northern-hemisphere calendar elsewhere', () => {
    expect(deriveSeason(new Date('2026-08-12'), 'FR')).toBe(Season.SUMMER);
  });
});

describe('nightsBetween', () => {
  it('counts hotel nights', () => {
    expect(nightsBetween(new Date('2026-08-12'), new Date('2026-08-15'))).toBe(3);
  });
});

describe('isDateWithin', () => {
  const start = new Date('2026-08-12');
  const end = new Date('2026-08-15');

  it('includes both boundaries', () => {
    expect(isDateWithin(new Date('2026-08-12'), start, end)).toBe(true);
    expect(isDateWithin(new Date('2026-08-15'), start, end)).toBe(true);
  });

  it('excludes dates outside the range', () => {
    expect(isDateWithin(new Date('2026-08-16'), start, end)).toBe(false);
  });
});
