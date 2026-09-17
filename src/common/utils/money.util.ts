import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal | number | string | null | undefined;

/** Decimal columns arrive as Prisma.Decimal; JSON needs plain numbers. */
export function toNumber(value: Money): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Percentage of `part` within `total`, guarding division by zero. */
export function percentOf(part: number, total: number): number {
  if (!total) return 0;
  return round2((part / total) * 100);
}
