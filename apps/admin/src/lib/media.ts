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
