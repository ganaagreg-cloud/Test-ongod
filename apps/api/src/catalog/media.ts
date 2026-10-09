import type { BunnySigner } from '../lib/bunnyToken';

/** Play links are valid for at most this long (and never past the end of the user's access). */
export const PLAY_URL_TTL_MS = 4 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/**
 * Cover variants (ADR-0034): `coverPath` is the 1280x720 picture; the 400x225 one sits next to it with a
 * "-400" suffix before the extension (covers/x/abc.webp -> covers/x/abc-400.webp).
 */
export const thumbPathOf = (coverPath: string) =>
  /\.[A-Za-z0-9]+$/.test(coverPath)
    ? coverPath.replace(/(\.[A-Za-z0-9]+)$/, '-400$1')
    : `${coverPath}-400`;

const asUrlPath = (path: string) => `/${path.replace(/^\/+/, '')}`;

/**
 * Turns stored Bunny paths into signed pull zone URLs (ADR-0004, ADR-0020).
 * Without a signer (Bunny not configured) covers are null and playback is unavailable.
 */
export interface MediaUrls {
  readonly enabled: boolean;
  cover(coverPath: string, now: Date): { coverUrl: string | null; thumbUrl: string | null };
  /** Throws if the path cannot be signed (non-ASCII), which is a data error worth a 500 + alert. */
  audio(path: string, expiresAt: Date): string;
}

export function createMediaUrls(signer: BunnySigner | undefined): MediaUrls {
  const signCover = (path: string, now: Date): string | null => {
    if (!signer) return null;
    // Same expiry for everyone during a UTC day, so a cover URL stays identical (and cacheable)
    // for a day; it is valid for 24 to 48 hours.
    const expiresAt = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS + 2 * DAY_MS);
    try {
      return signer.signUrl({ path: asUrlPath(path), expiresAt });
    } catch {
      return null; // one bad cover path must not break a whole list
    }
  };

  return {
    enabled: signer !== undefined,
    cover: (coverPath, now) => ({
      coverUrl: signCover(coverPath, now),
      thumbUrl: signCover(thumbPathOf(coverPath), now),
    }),
    audio(path, expiresAt) {
      if (!signer) throw new Error('Bunny is not configured');
      return signer.signUrl({ path: asUrlPath(path), expiresAt });
    },
  };
}
