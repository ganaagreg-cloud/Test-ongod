import { access, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFile } from 'music-metadata';
import { z } from 'zod';
import type { Db } from '../db';
import { mn } from '../i18n/mn';
import { enqueue, type JobWriter } from '../jobs/queue';
import { defineJob, PermanentJobError, type JobDefinition } from '../jobs/registry';
import { thumbPathOf } from '../catalog/media';
import { classifyStreamVideo, type StreamClient } from '../lib/bunnyStream';
import { coverFiles } from './cover';
import type { MediaStorage, UploadDirs } from './storage';

// Slow media work runs as jobs, never inside a request (CLAUDE.md). All of them are idempotent: a
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
/** A series cover (ADR-0042): the same two sizes as an episode cover, stored under covers/series. */
export const seriesCoverUploadSpec = {
  type: 'media.series-cover-upload',
  schema: z.object({ seriesId: z.string().min(1), coverId: z.string().min(1) }),
  maxAttempts: 5,
};
/** A playlist cover (ADR-0042): the same two sizes, stored under covers/playlists. */
export const playlistCoverUploadSpec = {
  type: 'media.playlist-cover-upload',
  schema: z.object({ playlistId: z.string().min(1), coverId: z.string().min(1) }),
  maxAttempts: 5,
};
/** A category cover: the same two sizes, stored under covers/category. */
export const categoryCoverUploadSpec = {
  type: 'media.category-cover-upload',
  schema: z.object({ categoryId: z.string().min(1), coverId: z.string().min(1) }),
  maxAttempts: 5,
};
export const storageDeleteSpec = {
  type: 'media.delete-files',
  schema: z.object({ paths: z.array(z.string().min(1)).min(1).max(50) }),
  maxAttempts: 5,
};
/** Video (ADR-0038): create the Stream video and send the file. */
export const videoUploadSpec = {
  type: 'media.video-upload',
  schema: z.object({ assetId: z.string().min(1) }),
  maxAttempts: 3,
};
/** Video: follow Bunny's processing until READY or FAILED; re-queues itself while it runs. */
export const videoStatusSpec = {
  type: 'media.video-status',
  schema: z.object({ assetId: z.string().min(1), startedAt: z.iso.datetime() }),
  maxAttempts: 5,
};
export const streamDeleteSpec = {
  type: 'media.delete-stream-videos',
  schema: z.object({ videoIds: z.array(z.string().min(1)).min(1).max(50) }),
  maxAttempts: 5,
};

/** How often processing is checked, and when it is given up. */
export const VIDEO_POLL_MS = 30_000;
export const VIDEO_PROCESSING_LIMIT_MS = 6 * 60 * 60_000;
/** A Stream video object not created yet (the job creates it and stores its id here). */
export const PENDING_PATH = 'pending';

export const enqueueAudioUpload = (db: JobWriter, assetId: string) =>
  enqueue(db, audioUploadSpec, { assetId });
export const enqueueCoverUpload = (db: JobWriter, episodeId: string, coverId: string) =>
  enqueue(db, coverUploadSpec, { episodeId, coverId });
export const enqueueSeriesCoverUpload = (db: JobWriter, seriesId: string, coverId: string) =>
  enqueue(db, seriesCoverUploadSpec, { seriesId, coverId });
export const enqueuePlaylistCoverUpload = (db: JobWriter, playlistId: string, coverId: string) =>
  enqueue(db, playlistCoverUploadSpec, { playlistId, coverId });
export const enqueueCategoryCoverUpload = (db: JobWriter, categoryId: string, coverId: string) =>
  enqueue(db, categoryCoverUploadSpec, { categoryId, coverId });
export const enqueueStorageDelete = (db: JobWriter, paths: string[]) =>
  paths.length > 0 ? enqueue(db, storageDeleteSpec, { paths }) : undefined;
export const enqueueVideoUpload = (db: JobWriter, assetId: string) =>
  enqueue(db, videoUploadSpec, { assetId });
export const enqueueStreamDelete = (db: JobWriter, videoIds: string[]) =>
  videoIds.length > 0 ? enqueue(db, streamDeleteSpec, { videoIds }) : undefined;

/** The upload job a media kind needs (Retry and tus use it). */
export const enqueueMediaUpload = (db: JobWriter, kind: 'AUDIO' | 'VIDEO', assetId: string) =>
  kind === 'VIDEO' ? enqueueVideoUpload(db, assetId) : enqueueAudioUpload(db, assetId);

/** Where a media asset's stored copy lives, for deletion: Bunny Storage path or Stream video id. */
export function splitStored(
  assets: Array<{ provider: 'BUNNY_STORAGE' | 'BUNNY_STREAM'; path: string }>,
) {
  const paths: string[] = [];
  const videoIds: string[] = [];
  for (const a of assets) {
    if (a.path === PENDING_PATH) continue;
    (a.provider === 'BUNNY_STREAM' ? videoIds : paths).push(a.path);
  }
  return { paths, videoIds };
}

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

export function createMediaJobs(deps: {
  db: Db;
  storage: MediaStorage;
  dirs: UploadDirs;
  /** Bunny Stream; without it video uploads fail with a reason the admin can read. */
  stream?: StreamClient | undefined;
  /** Tests make the status checks immediate. */
  videoPollMs?: number;
  now?: () => Date;
}) {
  const { db, storage, dirs, stream } = deps;
  const pollMs = deps.videoPollMs ?? VIDEO_POLL_MS;
  const now = deps.now ?? (() => new Date());

  /**
   * After a new file is READY the episode's other files go (one media file per episode,
   * ADR-0038): their rows in the same transaction as the switch, then the stored copies wherever
   * they live, and any local copies.
   */
  async function removeReplaced(
    replaced: Array<{ id: string; provider: 'BUNNY_STORAGE' | 'BUNNY_STREAM'; path: string }>,
    log: { warn: (obj: object, msg: string) => void },
  ) {
    const { paths, videoIds } = splitStored(replaced);
    for (const path of paths) {
      await storage.delete(path).catch((err) => log.warn({ err }, 'old media file not deleted'));
    }
    for (const id of videoIds) {
      if (!stream) {
        log.warn({}, 'old Stream video not deleted: Bunny Stream is not configured');
        continue;
      }
      await stream
        .deleteVideo(id)
        .catch((err) => log.warn({ err }, 'old Stream video not deleted'));
    }
    for (const old of replaced) {
      await rm(join(dirs.audio, old.id), { force: true });
      await rm(join(dirs.video, old.id), { force: true });
    }
  }

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
          select: { id: true, provider: true, path: true },
        });
        await db.$transaction([
          db.mediaAsset.updateMany({
            where: { id: assetId, status: { in: ['PROCESSING', 'FAILED'] } },
            data: { status: 'READY', failReason: null, sizeBytes: BigInt(size), durationSec },
          }),
          db.mediaAsset.deleteMany({ where: { id: { in: others.map((o) => o.id) } } }),
        ]);
        // The replaced files (stored copy and any leftover local copy) go away after the switch.
        await removeReplaced(others, log);
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

  /** Both sizes go to storage first; only then does the series point at them. */
  const seriesCoverUpload = defineJob({
    ...seriesCoverUploadSpec,
    async handle({ seriesId, coverId }, { log }) {
      const series = await db.series.findUnique({
        where: { id: seriesId },
        select: { coverPath: true },
      });
      if (!series) return;
      const local = coverFiles(dirs, coverId);
      if (!(await exists(local.full)) || !(await exists(local.thumb))) return;
      const path = `covers/series/${seriesId}/${coverId}.webp`;
      await storage.putFile(path, local.full, 'image/webp');
      await storage.putFile(thumbPathOf(path), local.thumb, 'image/webp');
      await db.series.update({ where: { id: seriesId }, data: { coverPath: path } });

      if (series.coverPath && series.coverPath !== path) {
        for (const old of [series.coverPath, thumbPathOf(series.coverPath)]) {
          await storage.delete(old).catch((err) => log.warn({ err }, 'old cover not deleted'));
        }
      }
      await rm(local.full, { force: true });
      await rm(local.thumb, { force: true });
    },
  });

  const playlistCoverUpload = defineJob({
    ...playlistCoverUploadSpec,
    async handle({ playlistId, coverId }, { log }) {
      const playlist = await db.playlist.findUnique({
        where: { id: playlistId },
        select: { coverPath: true },
      });
      if (!playlist) return;
      const local = coverFiles(dirs, coverId);
      if (!(await exists(local.full)) || !(await exists(local.thumb))) return;
      const path = `covers/playlists/${playlistId}/${coverId}.webp`;
      await storage.putFile(path, local.full, 'image/webp');
      await storage.putFile(thumbPathOf(path), local.thumb, 'image/webp');
      await db.playlist.update({ where: { id: playlistId }, data: { coverPath: path } });

      if (playlist.coverPath && playlist.coverPath !== path) {
        for (const old of [playlist.coverPath, thumbPathOf(playlist.coverPath)]) {
          await storage.delete(old).catch((err) => log.warn({ err }, 'old cover not deleted'));
        }
      }
      await rm(local.full, { force: true });
      await rm(local.thumb, { force: true });
    },
  });

  const categoryCoverUpload = defineJob({
    ...categoryCoverUploadSpec,
    async handle({ categoryId, coverId }, { log }) {
      const category = await db.category.findUnique({
        where: { id: categoryId },
        select: { coverPath: true },
      });
      if (!category) return;
      const local = coverFiles(dirs, coverId);
      if (!(await exists(local.full)) || !(await exists(local.thumb))) return;
      const path = `covers/category/${categoryId}/${coverId}.webp`;
      await storage.putFile(path, local.full, 'image/webp');
      await storage.putFile(thumbPathOf(path), local.thumb, 'image/webp');
      await db.category.update({ where: { id: categoryId }, data: { coverPath: path } });

      if (category.coverPath && category.coverPath !== path) {
        for (const old of [category.coverPath, thumbPathOf(category.coverPath)]) {
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

  /** Marks a video FAILED with a reason; only from a state where that still makes sense. */
  const failVideo = (assetId: string, reason: string) =>
    db.mediaAsset.updateMany({
      where: { id: assetId, status: { in: ['PROCESSING', 'UPLOADING'] } },
      data: { status: 'FAILED', failReason: reason },
    });

  /**
   * Video: create the Stream video (its id is stored at once, so a retry reuses it), send the
   * file, then hand over to the status job. The local file stays until the video is READY, so a
   * processing failure can be retried without a new upload.
   */
  const videoUpload = defineJob({
    ...videoUploadSpec,
    async handle({ assetId }, { attempt }) {
      const asset = await db.mediaAsset.findUnique({
        where: { id: assetId },
        include: { episode: { select: { title: true } } },
      });
      if (!asset || asset.status !== 'PROCESSING') return;

      const local = join(dirs.video, assetId);
      try {
        if (!stream) throw new PermanentJobError(mn.media.failStreamNotConfigured);
        if (!(await exists(local))) throw new PermanentJobError(mn.media.failMissingFile);

        let videoId = asset.path;
        if (videoId === PENDING_PATH) {
          videoId = await stream.createVideo(asset.episode.title || assetId);
          await db.mediaAsset.updateMany({
            where: { id: assetId, path: PENDING_PATH },
            data: { path: videoId },
          });
        }
        await stream.uploadVideo(videoId, local);
        await enqueue(
          db,
          videoStatusSpec,
          { assetId, startedAt: now().toISOString() },
          {
            runAt: new Date(now().getTime() + pollMs),
          },
        );
      } catch (err) {
        const unfixable = err instanceof PermanentJobError;
        if (unfixable || attempt >= videoUploadSpec.maxAttempts) {
          await failVideo(assetId, failReasonFor(err));
        }
        if (!unfixable) throw err;
      }
    },
  });

  /**
   * Video: ask Bunny how processing goes. READY: length saved, older media of the episode
   * removed, local file deleted. Bunny's error, a deleted video or six hours without a result:
   * FAILED with a reason (Retry sends the kept file again). Otherwise: check again later.
   */
  const videoStatus = defineJob({
    ...videoStatusSpec,
    async handle({ assetId, startedAt }, { log }) {
      const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
      if (!asset || asset.status !== 'PROCESSING' || asset.path === PENDING_PATH) return;
      if (!stream) {
        await failVideo(assetId, mn.media.failStreamNotConfigured);
        return;
      }

      const video = await stream.getVideo(asset.path);
      if (!video) {
        await failVideo(assetId, mn.media.failVideoGone);
        return;
      }
      const state = classifyStreamVideo(video);
      if (state === 'failed') {
        await failVideo(assetId, mn.media.failVideoProcessing);
        return;
      }
      if (state === 'processing') {
        if (now().getTime() - new Date(startedAt).getTime() > VIDEO_PROCESSING_LIMIT_MS) {
          await failVideo(assetId, mn.media.failVideoTimeout);
          return;
        }
        await enqueue(
          db,
          videoStatusSpec,
          { assetId, startedAt },
          {
            runAt: new Date(now().getTime() + pollMs),
          },
        );
        return;
      }

      const others = await db.mediaAsset.findMany({
        where: { episodeId: asset.episodeId, id: { not: assetId } },
        select: { id: true, provider: true, path: true },
      });
      const [switched] = await db.$transaction([
        db.mediaAsset.updateMany({
          where: { id: assetId, status: 'PROCESSING' },
          data: { status: 'READY', failReason: null, durationSec: Math.round(video.length) },
        }),
        db.mediaAsset.deleteMany({ where: { id: { in: others.map((o) => o.id) } } }),
      ]);
      if (switched.count !== 1) return;
      await removeReplaced(others, log);
      await rm(join(dirs.video, assetId), { force: true });
    },
  });

  const deleteStreamVideos = defineJob({
    ...streamDeleteSpec,
    async handle({ videoIds }) {
      if (!stream) throw new PermanentJobError('Bunny Stream is not configured');
      for (const id of videoIds) await stream.deleteVideo(id);
    },
  });

  return [
    audioUpload,
    coverUpload,
    seriesCoverUpload,
    playlistCoverUpload,
    categoryCoverUpload,
    deleteFiles,
    videoUpload,
    videoStatus,
    deleteStreamVideos,
  ] as unknown as JobDefinition[];
}
