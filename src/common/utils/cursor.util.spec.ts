import { buildPage, decodeCursor, encodeCursor } from './cursor.util';

describe('cursor encoding', () => {
  it('round-trips an id and a timestamp', () => {
    const at = new Date('2026-08-14T10:12:00.000Z');
    const decoded = decodeCursor(encodeCursor('trip-1', at));
    expect(decoded).toEqual({ id: 'trip-1', v: at.toISOString() });
  });

  it('returns null for malformed or absent cursors', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('not-base64!!')).toBeNull();
    expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
  });
});

describe('buildPage', () => {
  const rows = [
    { id: 'a', createdAt: new Date('2026-08-03') },
    { id: 'b', createdAt: new Date('2026-08-02') },
    { id: 'c', createdAt: new Date('2026-08-01') },
  ];

  it('trims the lookahead row and exposes a cursor', () => {
    const page = buildPage(rows, 2, (r) => r.createdAt);
    expect(page.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor!)?.id).toBe('b');
  });

  it('reports the end of the list', () => {
    const page = buildPage(rows, 5, (r) => r.createdAt);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
