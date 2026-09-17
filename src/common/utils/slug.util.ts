import { randomBytes } from 'node:crypto';
import slugify from 'slugify';

export function toSlug(input: string): string {
  return slugify(input, { lower: true, strict: true, trim: true }).slice(0, 80) || 'item';
}

/**
 * Slugs must be unique but trips are created concurrently, so a short random
 * suffix is cheaper (and race-free) than a select-then-increment loop.
 */
export function uniqueSlug(input: string): string {
  return `${toSlug(input)}-${randomBytes(4).toString('hex')}`;
}
