import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

/**
 * Bunny Storage HTTP API.
 * Docs: https://bunny.net/docs/storage/http  (facts: docs/research/R-bunny-token-auth.md)
 *
 *   PUT    https://<region host>/<zone>/<path>   raw binary body, header AccessKey = zone password
 *   DELETE https://<region host>/<zone>/<path>
 */

export interface BunnyStorageConfig {
  zone: string;
  /** The storage zone password. Not the account API key and not the Stream key. */
  apiKey: string;
  /** Region prefix: 'de' (Frankfurt) or uk, ny, la, sg, se, br, jh, syd. */
  region: string;
}

export function bunnyStorageHost(region: string): string {
  return region === 'de' ? 'storage.bunnycdn.com' : `${region}.storage.bunnycdn.com`;
}

function fileUrl(cfg: BunnyStorageConfig, path: string): string {
  if (!/^\/[\x21-\x7e]+$/.test(path) || /[?#]/.test(path)) {
    throw new Error('storage path must be an absolute printable-ASCII path');
  }
  return `https://${bunnyStorageHost(cfg.region)}/${encodeURIComponent(cfg.zone)}${path}`;
}

export class BunnyStorageError extends Error {
  constructor(
    readonly status: number,
    action: string,
  ) {
    super(`Bunny storage ${action} failed with HTTP ${status}`);
  }
}

export async function bunnyPutFile(
  cfg: BunnyStorageConfig,
  path: string,
  body: Buffer,
  contentType = 'application/octet-stream',
): Promise<void> {
  const res = await fetch(fileUrl(cfg, path), {
    method: 'PUT',
    headers: { AccessKey: cfg.apiKey, 'Content-Type': contentType },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status !== 201) throw new BunnyStorageError(res.status, 'upload');
}

export async function bunnyDeleteFile(cfg: BunnyStorageConfig, path: string): Promise<void> {
  const res = await fetch(fileUrl(cfg, path), {
    method: 'DELETE',
    headers: { AccessKey: cfg.apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 200 && res.status !== 404) throw new BunnyStorageError(res.status, 'delete');
}

/**
 * Uploads a file from disk without loading it into memory (audio files are tens of MB). The
 * timeout is long on purpose: a 100 MB file on a slow uplink takes minutes.
 */
export async function bunnyPutLocalFile(
  cfg: BunnyStorageConfig,
  path: string,
  localFile: string,
  contentType = 'application/octet-stream',
): Promise<void> {
  const { size } = await stat(localFile);
  const res = await fetch(fileUrl(cfg, path), {
    method: 'PUT',
    headers: {
      AccessKey: cfg.apiKey,
      'Content-Type': contentType,
      'Content-Length': String(size),
    },
    body: Readable.toWeb(createReadStream(localFile)) as unknown as ReadableStream,
    // Node needs this to stream a request body.
    duplex: 'half',
    signal: AbortSignal.timeout(30 * 60_000),
  } as RequestInit);
  if (res.status !== 201) throw new BunnyStorageError(res.status, 'upload');
}
