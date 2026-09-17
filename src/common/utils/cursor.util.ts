/**
 * Cursors are base64url of `{ id, v }` where `v` is the sort value (usually a
 * timestamp). Opaque to clients on purpose so the sort key can change later.
 */
export interface DecodedCursor {
  id: string;
  v: string;
}

export function encodeCursor(id: string, sortValue: Date | string | number): string {
  const v = sortValue instanceof Date ? sortValue.toISOString() : String(sortValue);
  return Buffer.from(JSON.stringify({ id, v }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor?: string): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.id === 'string' && typeof parsed?.v === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Takes `limit + 1` rows, trims the extra one and turns it into the cursor.
 */
export function buildPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortValueOf: (row: T) => Date | string | number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(last.id, sortValueOf(last)) : null,
  };
}
