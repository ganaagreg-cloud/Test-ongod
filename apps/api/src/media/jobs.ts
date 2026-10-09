import { access, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFile } from 'music-metadata';
import { z } from 'zod';
import type { Db } from '../db';
import { mn } from '../i18n/mn';
import { enqueue, type JobWriter } from '../jobs/queue';
import { defineJob, PermanentJobError, type JobDefinition } from '../jobs/registry';
import { thumbPathOf } from '../catalog/media';
import { coverFiles } from './cover';
import type { MediaStorage, UploadDirs } from './storage';

// Slow media work runs as jobs, never inside a request (CLAUDE.md). All three are idempotent: a
// job that runs again after a crash finds the work done or does it again without harm.

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
};
export const audioMime = (path: string) =>
  AUDIO_MIME[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

export const audioUploadSpec = {
  type: 'media.audio-upload',
  schema: z.object({ assetId: z.string().min(1) }),
  maxAttempts: 3,
};
export const coverUploadSpec = {
  type: 'media.cover-upload',
  schema: z.object({ episodeId: z.string().min(1), coverId: z.string().min(1) }),
  maxAttempts: 5,
};
export const storageDeleteSpec = {
  type: 'media.delete-files',
  schema: z.object({ paths: z.array(z.string().min(1)).min(1).max(50) }),
  maxAttempts: 5,
};

export const enqueueAudioUpload = (db: JobWriter, assetId: string) =>
  enqueue(db, audioUploadSpec, { assetId });
export const enqueueCoverUpload = (db: JobWriter, episodeId: string, coverId: string) =>
  enqueue(db, coverUploadSpec, { episodeId, coverId });
export const enqueueStorageDelete = (db: JobWriter, paths: string[]) =>
  paths.length > 0 ? enqueue(db, storageDeleteSpec, { paths }) : undefined;

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** The reason an admin reads next to the Retry button. */
function failReasonFor(err: unknown): string {
  if (err instanceof PermanentJobError) return err.message;
  return mn.media.failStorage;
}

export function createMediaJobs(deps: { db: Db; storage: MediaStorage; dirs: UploadDirs }) {
  const { db, storage, dirs } = deps;

  /**
   * Stored audio: read the length, send the file to storage, mark the asset READY, drop older
   * audio of the same episode (a re-upload replaces it). A failure marks the asset FAILED with a
   * reason once the retries are used up (or at once for a file that can never work).
   */
  const audioUpload = defineJob({
    ...audioUploadSpec,
    async handle({ assetId }, { attempt, log }) {
      const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
      // Deleted meanwhile (episode removed), or already done by an earlier run: nothing to do.
      if (!asset || asset.status === 'READY') return;

      const local = join(dirs.audio, assetId);
      try {
        if (!(await exists(local))) throw new PermanentJobError(mn.media.failMissingFile);

        let durationSec: number | null = null;
        try {
          const meta = await parseFile(local);
          if (meta.format.duration) durationSec = Math.round(meta.format.duration);
          if (!meta.format.container && !meta.format.codec) throw new Error('not audio');
        } catch {
          throw new PermanentJobError(mn.media.failUnreadable);
        }

        await storage.putFile(asset.path, local, audioMime(asset.path));
        const { size } = await stat(local);

        const others = await db.mediaAsset.findMany({
          where: { episodeId: asset.episodeId, id: { not: assetId } },
          select: { id: true, path: true },
        });
        await db.$transaction([
          db.mediaAsset.updateMany({
            where: { id: assetId, status: { in: ['PROCESSING', 'FAILED'] } },
            data: { status: 'READY', failReason: null, sizeBytes: BigInt(size), durationSec },
          }),
          db.mediaAsset.deleteMany({ where: { id: { in: others.map((o) => o.id) } } }),
        ]);
        // The replaced files (stored copy and any leftover local copy) go away after the switch.
        for (const old of others) {
          await storage.delete(old.path).catch((err) => log.warn({ err }, 'old audio not deleted'));
          await rm(join(dirs.audio, old.id), { force: true });
        }
        await rm(local, { force: true });
      } catch (err) {
        const unfixable = err instanceof PermanentJobError;
        if (unfixable || attempt >= audioUploadSpec.maxAttempts) {
          await db.mediaAsset.updateMany({
            where: { id: assetId, status: { in: ['PROCESSING', 'UPLOADING'] } },
            data: { status: 'FAILED', failReason: failReasonFor(err) },
          });
        }
        // A bad file is the uploader's problem: the admin sees the reason and the Retry button,
        // and the owner gets no alert email. Storage errors still retry, and alert if they last.
        if (!unfixable) throw err;
      }
    },
  });

  /** Both cover sizes go to storage first; only then does the episode point at them. */
  const coverUpload = defineJob({
    ...coverUploadSpec,
    async handle({ episodeId, coverId }, { log }) {
      const episode = await db.episode.findUnique({
        where: { id: episodeId },
        select: { coverPath: true },
      });
      if (!episode) return;
      const local = coverFiles(dirs, coverId);
      if (!(await exists(local.full)) || !(await exists(local.thumb))) {
        // A run that already finished removed them. Nothing left to do.
        return;
      }
      const path = `covers/${episodeId}/${coverId}.webp`;
      await storage.putFile(path, local.full, 'image/webp');
      await storage.putFile(thumbPathOf(path), local.thumb, 'image/webp');
      await db.episode.update({ where: { id: episodeId }, data: { coverPath: path } });

      if (episode.coverPath && episode.coverPath !== path) {
        for (const old of [episode.coverPath, thumbPathOf(episode.coverPath)]) {
          await storage.delete(old).catch((err) => log.warn({ err }, 'old cover not deleted'));
        }
      }
      await rm(local.full, { force: true });
      await rm(local.thumb, { force: true });
    },
  });

  const deleteFiles = defineJob({
    ...storageDeleteSpec,
    async handle({ paths }) {
      for (const path of paths) await storage.delete(path);
    },
  });

  return [audioUpload, coverUpload, deleteFiles] as unknown as JobDefinition[];
}
