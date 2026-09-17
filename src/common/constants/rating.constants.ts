import { RatingCriteria, RatingType } from '@prisma/client';

/**
 * Which rating dimensions apply to which target (spec §14: "Not every category
 * needs to apply to every place ... BE should support configurable rating
 * dimensions").
 */
export const RATING_CRITERIA_MATRIX: Record<RatingType, RatingCriteria[]> = {
  [RatingType.TRIP]: [
    RatingCriteria.OVERALL,
    RatingCriteria.VALUE,
    RatingCriteria.SAFETY,
    RatingCriteria.FOOD,
    RatingCriteria.ACTIVITIES,
    RatingCriteria.ACCESSIBILITY,
  ],
  [RatingType.PLACE]: [
    RatingCriteria.OVERALL,
    RatingCriteria.SCENERY,
    RatingCriteria.CROWD,
    RatingCriteria.CLEANLINESS,
    RatingCriteria.ACCESSIBILITY,
    RatingCriteria.SAFETY,
    RatingCriteria.VALUE,
    RatingCriteria.PHOTOGRAPHY,
    RatingCriteria.FOOD,
    RatingCriteria.ACTIVITIES,
    RatingCriteria.FAMILY_FRIENDLY,
    RatingCriteria.COUPLE_FRIENDLY,
    RatingCriteria.SOLO_FRIENDLY,
  ],
  [RatingType.HOTEL]: [
    RatingCriteria.OVERALL,
    RatingCriteria.CLEANLINESS,
    RatingCriteria.SERVICE,
    RatingCriteria.LOCATION,
    RatingCriteria.COMFORT,
    RatingCriteria.VALUE,
    RatingCriteria.FOOD,
  ],
  [RatingType.RESTAURANT]: [
    RatingCriteria.OVERALL,
    RatingCriteria.FOOD,
    RatingCriteria.SERVICE,
    RatingCriteria.VALUE,
    RatingCriteria.CLEANLINESS,
  ],
  [RatingType.ACTIVITY]: [
    RatingCriteria.OVERALL,
    RatingCriteria.VALUE,
    RatingCriteria.SAFETY,
    RatingCriteria.ACTIVITIES,
  ],
};

export function isCriteriaAllowed(type: RatingType, criteria: RatingCriteria): boolean {
  return RATING_CRITERIA_MATRIX[type].includes(criteria);
}

export const RATING_MIN = 1;
export const RATING_MAX = 5;
