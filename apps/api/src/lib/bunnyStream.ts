import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createBunnySigner } from './bunnyToken';

/**
 * Bunny Stream HTTP API (video episodes, ADR-0038). Facts: docs/research/R-bunny-stream.md.
 *
 *   POST   https://video.bunnycdn.com/library/<libraryId>/videos          {"title"} -> {"guid"}
 *   PUT    https://video.bunnycdn.com/library/<libraryId>/videos/<guid>   raw file
 *   GET    https://video.bunnycdn.com/library/<libraryId>/videos/<guid>   status, encodeProgress, length
 *   DELETE https://video.bunnycdn.com/library/<libraryId>/videos/<guid>
 *
 * Header AccessKey = the library's API key (BUNNY_STREAM_API_KEY), not the storage password.
 *
 * The picture Bunny takes from a video is on the library's CDN, `https://<cdn host>/<guid>/thumbnail.jpg`
 * (R-bunny-stream, TO-VERIFY on the first live upload), behind the same token authentication as
 * the playlist, so it is fetched with a short signed URL.
 */

export interface BunnyStreamConfig {
  libraryId: string;
  apiKey: string;
  /** The library's CDN host and token key: needed for the video's picture (ADR-0069). */
  cdnHost?: string;
  tokenKey?: string;
  /** Only tests change this. */
  baseUrl?: string;
}

export interface StreamVideo {
  guid: string;
  status: number;
  /** 0–100. */
  encodeProgress: number;
  /** Seconds; 0 until Bunny has read the file. */
  length: number;
}

export interface StreamClient {
  /** Creates the empty video object and returns its id (guid). */
  createVideo(title: string): Promise<string>;
  /** Sends the file from disk without loading it into memory. */
  uploadVideo(guid: string, localFile: string): Promise<void>;
  /** null when the video does not exist (deleted in the dashboard). */
  getVideo(guid: string): Promise<StreamVideo | null>;
  /** A video that is already gone is not an error. */
  deleteVideo(guid: string): Promise<void>;
  /** The picture Bunny took from the video; null when there is none (yet) or no CDN settings. */
  getThumbnail(guid: string): Promise<Buffer | null>;
}

export class BunnyStreamError extends Error {
  constructor(
    readonly status: number,
    action: string,
  ) {
    super(`Bunny Stream ${action} failed with HTTP ${status}`);
  }
}

/**
 * What a video's state means for us. Bunny's status numbers are not confirmed by its docs
 * (R-bunny-stream: sources disagree), so "ready" also accepts a finished encode with a known
 * length, and only the error states fail. Check against the first live upload.
 */
export function classifyStreamVideo(video: StreamVideo): 'ready' | 'failed' | 'processing' {
  if (video.status === 5 || video.status === 6) return 'failed';
  if (video.status === 4 || (video.encodeProgress >= 100 && video.length > 0)) return 'ready';
  return 'processing';
}

const GUID = /^[0-9a-f-]{36}$/i;

export function createBunnyStreamClient(cfg: BunnyStreamConfig): StreamClient {
  if (!/^\d+$/.test(cfg.libraryId)) throw new Error('Bunny Stream library id must be numeric');
  if (!cfg.apiKey) throw new Error('Bunny Stream API key must not be empty');
  const base = `${cfg.baseUrl ?? 'https://video.bunnycdn.com'}/library/${cfg.libraryId}/videos`;
  const videoUrl = (guid: string) => {
    // Our own ids come back from Bunny; refuse anything else before it reaches a URL.
    if (!GUID.test(guid)) throw new Error('invalid Bunny Stream video id');
    return `${base}/${guid}`;
  };
  const headers = { AccessKey: cfg.apiKey, Accept: 'application/json' };
  const cdnSigner =
    cfg.cdnHost && cfg.tokenKey
      ? createBunnySigner({ host: cfg.cdnHost, tokenKey: cfg.tokenKey })
      : undefined;

  return {
    async createVideo(title) {
      const res = await fetch(base, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new BunnyStreamError(res.status, 'create');
      const body = (await res.json()) as { guid?: unknown };
      if (typeof body.guid !== 'string' || !GUID.test(body.guid)) {
        throw new Error('Bunny Stream create returned no video id');
      }
      return body.guid;
    },

    async uploadVideo(guid, localFile) {
      const { size } = await stat(localFile);
      const res = await fetch(videoUrl(guid), {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(size),
        },
        body: Readable.toWeb(createReadStream(localFile)) as unknown as ReadableStream,
        // Node needs this to stream a request body.
        duplex: 'half',
        // A 1.5 GB source on a slow uplink takes a long time.
        signal: AbortSignal.timeout(3 * 60 * 60_000),
      } as RequestInit);
      if (!res.ok) throw new BunnyStreamError(res.status, 'upload');
    },

    async getVideo(guid) {
      const res = await fetch(videoUrl(guid), { headers, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new BunnyStreamError(res.status, 'read');
      const body = (await res.json()) as Partial<Record<keyof StreamVideo, unknown>>;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      return {
        guid,
        status: num(body.status),
        encodeProgress: num(body.encodeProgress),
        length: num(body.length),
      };
    },

    async deleteVideo(guid) {
      const res = await fetch(videoUrl(guid), {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok && res.status !== 404) throw new BunnyStreamError(res.status, 'delete');
    },

    async getThumbnail(guid) {
      if (!cdnSigner) return null;
      videoUrl(guid); // validates the id
      const url = cdnSigner.signUrl({
        path: `/${guid}/thumbnail.jpg`,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new BunnyStreamError(res.status, 'thumbnail');
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
