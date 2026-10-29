import { STUCK_UPLOAD_MS, type AdminEpisodeDto } from '@ongod/shared';

/** The threshold lives in packages/shared: the dashboard API uses the same one (ADR-0056). */
export { STUCK_UPLOAD_MS };

/**
 * True for a file that has been UPLOADING for more than 15 minutes without a change to its row.
 * shortcut: the row is written when the upload starts and when it finishes, so a very slow upload
 * (a multi-GB video on a poor line) is also reported as stuck; upgrade when the API records
 * upload progress.
 */
export function isStuckUpload(media: AdminEpisodeDto['media'], now: number): boolean {
  return (
    media !== null &&
    media.status === 'UPLOADING' &&
    now - Date.parse(media.updatedAt) > STUCK_UPLOAD_MS
  );
}

/** Longest episode title the API takes. */
const TITLE_MAX = 200;

/**
 * A starting title from a picked file name, as YouTube does (ADR-0068): no extension, "_" and
 * runs of spaces become one space. The admin can change it before publishing.
 */
export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base
    .replace(/[_\s]+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX);
}

/**
 * The category a new item starts with: the one used last on this browser if it still exists,
 * else the only one there is; otherwise none (the admin picks it).
 */
export function startingCategory(ids: readonly string[], last: string | null): string {
  if (last && ids.includes(last)) return last;
  return ids.length === 1 ? ids[0]! : '';
}

/** The category the last new item was made in, on this browser (a convenience only). */
const LAST_CATEGORY_KEY = 'ongod:admin-last-category';
export const lastCategory = {
  read(): string | null {
    try {
      return localStorage.getItem(LAST_CATEGORY_KEY);
    } catch {
      return null;
    }
  },
  write(id: string) {
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, id);
    } catch {
      // Blocked storage: the admin picks the category each time.
    }
  },
};
