import { DetailedError, Upload } from 'tus-js-client';
import { ApiError, refreshSession, session } from '../api/client';
import { mn } from '../i18n/mn';

/** Where the API's tus endpoint lives (an absolute URL keeps the resume fingerprint stable). */
const endpoint = () => `${window.location.origin}/v1/admin/uploads/`;
/** Each chunk is its own request, so a dropped connection loses at most one chunk. */
const CHUNK_BYTES = 5 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 1000, 3000, 5000, 10_000, 20_000];

/** A failed upload in words the admin can read. */
export function describeUploadError(err: Error): string {
  if (err instanceof DetailedError) {
    // The tus server answers rejections with a plain Mongolian text body.
    const body = err.originalResponse?.getBody().trim();
    if (body && body.length < 200 && !body.startsWith('<')) return body;
  }
  return err instanceof ApiError ? err.message : mn.episodes.audio.uploadFailed;
}

/**
 * One episode's media file over tus (ADR-0029): 5 MB chunks, the session token read for every
 * request and refreshed on a 401, network and 5xx errors retried. Used by the single uploader and
 * by "Олон файл" (ADR-0070). Not started: the caller calls `start()` (or resumes first).
 */
export function createEpisodeUpload(
  file: File,
  episodeId: string,
  handlers: {
    onProgress: (sent: number, total: number) => void;
    onSuccess: () => void;
    onError: (err: Error) => void;
  },
): Upload {
  return new Upload(file, {
    endpoint: endpoint(),
    chunkSize: CHUNK_BYTES,
    retryDelays: RETRY_DELAYS_MS,
    metadata: { episodeId, filename: file.name, filetype: file.type },
    // The token changes every ~15 minutes, so it is read again for every request.
    onBeforeRequest: (req) => {
      const token = session.token();
      if (token) req.setHeader('Authorization', `Bearer ${token}`);
    },
    onAfterResponse: async (_req, res) => {
      // A failed refresh (offline, rate limit) is left to the retry below.
      if (res.getStatus() === 401) await refreshSession().catch(() => false);
    },
    onShouldRetry: (err, attempt) => {
      const status = err.originalResponse?.getStatus() ?? 0;
      if (status === 401) return attempt < RETRY_DELAYS_MS.length;
      // Other 4xx answers are real rejections (type, size, state); network and 5xx are retried.
      return (
        (status === 0 || status >= 500 || status === 409 || status === 423) &&
        attempt < RETRY_DELAYS_MS.length
      );
    },
    onProgress: handlers.onProgress,
    onSuccess: handlers.onSuccess,
    onError: handlers.onError,
  });
}
