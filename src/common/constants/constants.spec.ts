import { ExpenseCategory, RatingCriteria, RatingType } from '@prisma/client';
import { isValidSubcategory } from './expense.constants';
import { isCriteriaAllowed } from './rating.constants';

describe('expense subcategories', () => {
  it('accepts a subcategory that belongs to its category', () => {
    expect(isValidSubcategory(ExpenseCategory.TRANSPORTATION, 'FLIGHT')).toBe(true);
  });

  it('rejects one borrowed from another category', () => {
    expect(isValidSubcategory(ExpenseCategory.FOOD, 'FLIGHT')).toBe(false);
  });

  it('treats an omitted subcategory as valid', () => {
    expect(isValidSubcategory(ExpenseCategory.OTHER, null)).toBe(true);
  });
});

describe('rating criteria matrix', () => {
  it('allows scenery on a place', () => {
    expect(isCriteriaAllowed(RatingType.PLACE, RatingCriteria.SCENERY)).toBe(true);
  });

  it('does not allow scenery on a hotel', () => {
    expect(isCriteriaAllowed(RatingType.HOTEL, RatingCriteria.SCENERY)).toBe(false);
  });

  it('allows OVERALL on every rating type', () => {
    for (const type of Object.values(RatingType)) {
      expect(isCriteriaAllowed(type, RatingCriteria.OVERALL)).toBe(true);
    }
  });
});
