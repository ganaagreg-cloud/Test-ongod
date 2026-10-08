import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors';
import {
  decodeCursor,
  encodeCursor,
  pageAfter,
  type Direction,
  type Entry,
} from '../src/catalog/cursor';
import { createMediaUrls, thumbPathOf } from '../src/catalog/media';
import { createBunnySigner } from '../src/lib/bunnyToken';

const entry = (id: string, key: number): Entry => ({ id, key });

/** Walks every page and returns the ids in the order they were served. */
function walk(entries: Entry[], dir: Direction, limit: number): string[] {
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard++) {
    const page = pageAfter(entries, dir, limit, cursor ? decodeCursor(cursor) : undefined);
    seen.push(...page.items.map((e) => e.id));
    if (!page.nextCursor) return seen;
    cursor = page.nextCursor;
  }
  throw new Error('pagination did not terminate');
}

describe('cursor pagination', () => {
  // Ties on purpose: the id must keep the order total, otherwise rows repeat or vanish.
  const entries = [
    entry('a', 10),
    entry('b', 30),
    entry('c', 30),
    entry('d', 20),
    entry('e', 30),
    entry('f', 5),
    entry('g', 20),
  ];

  it.each([1, 2, 3, 7, 50])('serves every entry exactly once in order (limit %i)', (limit) => {
    const desc = walk(entries, 'desc', limit);
    expect(desc).toEqual(['e', 'c', 'b', 'g', 'd', 'a', 'f']);
    const asc = walk(entries, 'asc', limit);
    expect(asc).toEqual(['f', 'a', 'd', 'g', 'b', 'c', 'e']);
  });

  it('has no next cursor on the last page, and none for an empty list', () => {
    expect(pageAfter(entries, 'desc', 7).nextCursor).toBeNull();
    expect(pageAfter(entries, 'desc', 6).nextCursor).not.toBeNull();
    expect(pageAfter([], 'desc', 10)).toEqual({ items: [], nextCursor: null });
  });

  it('still works when the cursor entry has disappeared meanwhile', () => {
    const first = pageAfter(entries, 'desc', 2); // e, c
    const without = entries.filter((e) => e.id !== 'c');
    const next = pageAfter(without, 'desc', 10, decodeCursor(first.nextCursor!));
    expect(next.items.map((e) => e.id)).toEqual(['b', 'g', 'd', 'a', 'f']);
  });

  it('does not repeat entries when a newer one is added between pages', () => {
    const first = pageAfter(entries, 'desc', 3); // e, c, b
    const withNew = [...entries, entry('z', 99)];
    const next = pageAfter(withNew, 'desc', 10, decodeCursor(first.nextCursor!));
    expect(next.items.map((e) => e.id)).toEqual(['g', 'd', 'a', 'f']);
  });

  it('round-trips a cursor and rejects garbage with 400 VALIDATION_ERROR', () => {
    expect(decodeCursor(encodeCursor({ k: 12.5, id: 'x1' }))).toEqual({ k: 12.5, id: 'x1' });
    const bad = [
      'not-base64-json',
      Buffer.from('{"k":"1","id":"a"}').toString('base64url'),
      Buffer.from('{"k":1}').toString('base64url'),
      Buffer.from('[]').toString('base64url'),
      Buffer.from(`{"k":1,"id":"${'x'.repeat(65)}"}`).toString('base64url'),
    ];
    for (const value of bad) {
      expect(() => decodeCursor(value), value).toThrow(AppError);
      try {
        decodeCursor(value);
      } catch (err) {
        expect(err).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
      }
    }
  });
});

describe('media urls', () => {
  const signer = createBunnySigner({ host: 'test.b-cdn.net', tokenKey: 'k-0123456789abcdef' });
  const media = createMediaUrls(signer);

  it('derives the 400px thumbnail path next to the cover', () => {
    expect(thumbPathOf('covers/ep1/abc.webp')).toBe('covers/ep1/abc-400.webp');
    expect(thumbPathOf('covers/x.tar.jpg')).toBe('covers/x.tar-400.jpg');
    expect(thumbPathOf('covers/noext')).toBe('covers/noext-400');
  });

  it('keeps a cover URL identical for a whole UTC day (cacheable) and changes it the next day', () => {
    const morning = media.cover('covers/a.webp', new Date('2026-10-08T00:00:01Z'));
    const evening = media.cover('covers/a.webp', new Date('2026-10-08T23:59:59Z'));
    const nextDay = media.cover('covers/a.webp', new Date('2026-10-09T00:00:01Z'));
    expect(morning.coverUrl).toBe(evening.coverUrl);
    expect(nextDay.coverUrl).not.toBe(morning.coverUrl);
  });

  it('valid for 24 to 48 hours', () => {
    for (const at of ['2026-10-08T00:00:00Z', '2026-10-08T12:00:00Z', '2026-10-08T23:59:59Z']) {
      const now = new Date(at);
      const url = new URL(media.cover('covers/a.webp', now).coverUrl!);
      const ttlH = (Number(url.searchParams.get('expires')) * 1000 - now.getTime()) / 3_600_000;
      expect(ttlH).toBeGreaterThanOrEqual(24);
      expect(ttlH).toBeLessThanOrEqual(48);
    }
  });

  it('returns null covers (not an exception) for an unsignable path or without Bunny', () => {
    expect(media.cover('covers/эпизод.webp', new Date())).toEqual({
      coverUrl: null,
      thumbUrl: null,
    });
    const off = createMediaUrls(undefined);
    expect(off.enabled).toBe(false);
    expect(off.cover('covers/a.webp', new Date()).coverUrl).toBeNull();
    expect(() => off.audio('a.mp3', new Date())).toThrow();
  });

  it('refuses to sign an audio path that is not ASCII', () => {
    expect(() => media.audio('audio/онгод.mp3', new Date(Date.now() + 1000))).toThrow();
  });
});
