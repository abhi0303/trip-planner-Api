import { ExpenseCategory } from '@prisma/client';

/**
 * Allowed subcategories per category (spec §8). Kept as data rather than an
 * enum so the list can grow without a migration; validated at write time.
 */
export const EXPENSE_SUBCATEGORIES: Record<ExpenseCategory, string[]> = {
  [ExpenseCategory.TRANSPORTATION]: [
    'FLIGHT',
    'TRAIN',
    'BUS',
    'TAXI',
    'CAR_RENTAL',
    'FUEL',
    'PARKING',
    'FERRY',
    'BIKE_RENTAL',
    'OTHER',
  ],
  [ExpenseCategory.STAY]: ['HOTEL', 'HOSTEL', 'AIRBNB', 'RESORT', 'HOMESTAY', 'CAMPING', 'OTHER'],
  [ExpenseCategory.FOOD]: [
    'RESTAURANT',
    'CAFE',
    'STREET_FOOD',
    'GROCERIES',
    'DRINKS',
    'ROOM_SERVICE',
    'OTHER',
  ],
  [ExpenseCategory.ACTIVITIES]: [
    'ENTRY_TICKETS',
    'WATER_SPORTS',
    'ADVENTURE',
    'TOURS',
    'GUIDE',
    'SPA',
    'EVENTS',
    'OTHER',
  ],
  [ExpenseCategory.SHOPPING]: ['SOUVENIRS', 'CLOTHING', 'GIFTS', 'LOCAL_CRAFTS', 'OTHER'],
  [ExpenseCategory.OTHER]: ['VISA', 'INSURANCE', 'TIPS', 'SIM_INTERNET', 'MEDICAL', 'OTHER'],
};

export function isValidSubcategory(category: ExpenseCategory, subcategory?: string | null): boolean {
  if (!subcategory) return true;
  return EXPENSE_SUBCATEGORIES[category].includes(subcategory);
}
