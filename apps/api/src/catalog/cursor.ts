import { z } from 'zod';
import { AppError } from '../errors';

/**
 * Keyset pagination over an in-memory, already filtered list of { id, key }.
 *
 * Why in memory: "longest first" sorts by the audio duration, which lives on MediaAsset, not on
 * Episode, and a library of one creator is hundreds of episodes, not millions (ADR-0021). The
 * list is only { id, key }; full rows are loaded for the page afterwards.
 */
export interface Entry {
  id: string;
  /** Sort key: publish time in ms, duration in seconds, ... */
  key: number;
}
export type Direction = 'asc' | 'desc';

const cursorSchema = z.object({ k: z.number().finite(), id: z.string().min(1).max(64) });
export type Cursor = z.infer<typeof cursorSchema>;

export const encodeCursor = (c: Cursor): string =>
  Buffer.from(JSON.stringify({ k: c.k, id: c.id })).toString('base64url');

/** Throws a 400 VALIDATION_ERROR for anything that is not a cursor we issued. */
export function decodeCursor(value: string): Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR');
  }
}

/** Order of two entries; the id breaks ties so the order is total and stable. */
function compare(a: Cursor | Entry, b: Cursor | Entry, dir: Direction): number {
  const ka = 'k' in a ? a.k : a.key;
  const kb = 'k' in b ? b.k : b.key;
  let r = ka === kb ? 0 : ka < kb ? -1 : 1;
  if (r === 0) r = a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
  return dir === 'asc' ? r : -r;
}

export function sortEntries(entries: Entry[], dir: Direction): Entry[] {
  return [...entries].sort((a, b) => compare(a, b, dir));
}

export interface PageResult {
  items: Entry[];
  nextCursor: string | null;
}

/** The `limit` entries that come strictly after `cursor` (or from the start) in `dir` order. */
export function pageAfter(
  entries: Entry[],
  dir: Direction,
  limit: number,
  cursor?: Cursor,
): PageResult {
  const sorted = sortEntries(entries, dir);
  const rest = cursor ? sorted.filter((e) => compare(e, cursor, dir) > 0) : sorted;
  const items = rest.slice(0, limit);
  const last = items.at(-1);
  const more = rest.length > limit;
  return { items, nextCursor: more && last ? encodeCursor({ k: last.key, id: last.id }) : null };
}
