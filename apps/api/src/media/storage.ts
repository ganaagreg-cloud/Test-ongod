import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { bunnyDeleteFile, bunnyPutLocalFile } from '../lib/bunnyStorage';
import { missingBunnyKeys, requireBunny, type Env } from '../env';

/** Where finished media ends up. Bunny in production; a local folder in development and tests. */
export interface MediaStorage {
  readonly kind: 'bunny' | 'local';
  /** Stores a file from disk under a storage path such as "audio/<episode>/<asset>.mp3". */
  putFile(path: string, localFile: string, contentType: string): Promise<void>;
  /** Removes a stored file. A file that is already gone is not an error. */
  delete(path: string): Promise<void>;
}

export function createBunnyMediaStorage(env: Env): MediaStorage {
  const bunny = requireBunny(env);
  const cfg = { zone: bunny.storageZone, apiKey: bunny.storageApiKey, region: bunny.storageRegion };
  return {
    kind: 'bunny',
    putFile: (path, localFile, contentType) =>
      bunnyPutLocalFile(cfg, `/${path}`, localFile, contentType),
    delete: (path) => bunnyDeleteFile(cfg, `/${path}`),
  };
}

/** Development and tests: "stores" files by copying them under `root`. Never used in production. */
export function createLocalMediaStorage(root: string): MediaStorage {
  const base = resolve(root);
  const resolveSafe = (path: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(path) || path.includes('..')) {
      throw new Error('invalid storage path');
    }
    const full = resolve(base, path);
    if (!full.startsWith(base + sep)) throw new Error('invalid storage path');
    return full;
  };
  return {
    kind: 'local',
    async putFile(path, localFile) {
      const target = resolveSafe(path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(localFile, target);
    },
    async delete(path) {
      await rm(resolveSafe(path), { force: true });
    },
  };
}

/** Folders under UPLOADS_DIR (ADR-0027). */
export interface UploadDirs {
  root: string;
  /** tus chunks of uploads in progress. */
  tus: string;
  /** Finished audio waiting for storage, one file per MediaAsset id. */
  audio: string;
  /** Resized covers waiting for storage: <coverId>-1400.webp and <coverId>-400.webp. */
  covers: string;
  /** The "storage" of the local fallback. */
  published: string;
}

export const uploadDirs = (uploadsDir: string): UploadDirs => {
  const root = resolve(uploadsDir);
  return {
    root,
    tus: join(root, 'tus'),
    audio: join(root, 'audio'),
    covers: join(root, 'covers'),
    published: join(root, 'published'),
  };
};

export interface MediaRuntime {
  storage: MediaStorage;
  dirs: UploadDirs;
}

/**
 * Bunny when its settings are present (always, in production: env.ts refuses to start without
 * them); otherwise the local fallback, so the admin can be tried without a Bunny account.
 */
export function createMediaRuntime(env: Env): MediaRuntime {
  const dirs = uploadDirs(env.UPLOADS_DIR);
  const storage =
    missingBunnyKeys(env).length === 0
      ? createBunnyMediaStorage(env)
      : createLocalMediaStorage(dirs.published);
  return { storage, dirs };
}
