import { Prisma } from '@prisma/client';
import { percentOf, round2, toNumber } from './money.util';

describe('toNumber', () => {
  it('converts a Prisma Decimal without losing precision', () => {
    expect(toNumber(new Prisma.Decimal('50000.55'))).toBe(50000.55);
  });

  it('treats null and undefined as zero', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });
});

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(6249.999)).toBe(6250);
    expect(round2(1 / 3)).toBe(0.33);
  });
});

describe('percentOf', () => {
  it('reproduces the spec breakdown', () => {
    expect(percentOf(20000, 50000)).toBe(40);
    expect(percentOf(10000, 50000)).toBe(20);
    expect(percentOf(6000, 50000)).toBe(12);
    expect(percentOf(4000, 50000)).toBe(8);
  });

  it('returns 0 rather than NaN when the total is zero', () => {
    expect(percentOf(100, 0)).toBe(0);
  });
});
