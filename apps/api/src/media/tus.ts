import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_VIDEO_BYTES, maxBytesOf, mediaKindOfFile } from '@ongod/shared';
import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { audit } from '../admin/audit';
import type { Db } from '../db';
import type { Env } from '../env';
import { mn } from '../i18n/mn';
import { enqueueMediaUpload, enqueueStreamDelete, PENDING_PATH, splitStored } from './jobs';
import type { UploadDirs } from './storage';

/** Where the resumable upload endpoint lives (behind the admin guard, see routes/admin-content.ts). */
export const UPLOAD_PATH = '/v1/admin/uploads';
/** The header the route sets (after the guard) so the hooks know which admin is uploading. */
export const ADMIN_HEADER = 'x-admin-user-id';
/** Uploads left unfinished for this long are removed by the cron task. */
const EXPIRY_MS = 7 * 24 * 60 * 60_000;

const reject = (body: string, status_code = 400) => ({ status_code, body });

/**
 * Resumable media uploads, audio or video (tus 1.0, ADR-0010, ADR-0038). The browser sends the
 * file in chunks and can continue after a refresh or a dropped connection. The flow:
 *   create    -> a MediaAsset row in UPLOADING (validates the episode, file type and size; the
 *                kind comes from the extension)
 *   finished  -> the file is moved to <uploads>/audio|video/<assetId>, the asset becomes PROCESSING
 *                and its job is queued: media.audio-upload (read length, send to storage) or
 *                media.video-upload (send to Bunny Stream, then follow processing)
 */
export function createTusServer(deps: { db: Db; dirs: UploadDirs; env: Pick<Env, 'TRUST_PROXY'> }) {
  const { db, dirs } = deps;
  const store = new FileStore({ directory: dirs.tus, expirationPeriodInMilliseconds: EXPIRY_MS });

  const server = new Server({
    path: UPLOAD_PATH,
    datastore: store,
    maxSize: MAX_VIDEO_BYTES,
    // A relative Location works behind any proxy and in the Vite dev server.
    relativeLocation: true,
    respectForwardedHeaders: deps.env.TRUST_PROXY,

    async onUploadCreate(req, upload) {
      const { episodeId, filename } = upload.metadata ?? {};
      if (!episodeId || !filename) throw reject(mn.errors.UPLOAD_REJECTED);
      const kind = mediaKindOfFile(filename);
      if (!kind) throw reject(mn.media.unsupportedFile);
      const extension = filename.split('.').pop()!.toLowerCase();
      if (!upload.size) throw reject(mn.errors.UPLOAD_REJECTED);
      // Same answer as tus's own limit (413): the per-kind limit is lower for audio.
      if (upload.size > maxBytesOf(kind)) throw reject(mn.errors.UPLOAD_REJECTED, 413);

      const episode = await db.episode.findUnique({
        where: { id: episodeId },
        select: { id: true },
      });
      if (!episode) throw reject(mn.errors.NOT_FOUND, 404);

      // One file at a time: a file still being stored or processed blocks a second upload.
      const busy = await db.mediaAsset.count({ where: { episodeId, status: 'PROCESSING' } });
      if (busy > 0) throw reject(mn.errors.EPISODE_STATE, 409);
      // Earlier uploads that never finished are abandoned: this one replaces them. A failed video
      // that already reached Bunny Stream is deleted there by a job.
      const abandoned = await db.mediaAsset.findMany({
        where: { episodeId, status: { in: ['UPLOADING', 'FAILED'] } },
        select: { id: true, provider: true, path: true },
      });
      await db.$transaction(async (tx) => {
        await tx.mediaAsset.deleteMany({ where: { id: { in: abandoned.map((a) => a.id) } } });
        await enqueueStreamDelete(tx, splitStored(abandoned).videoIds);
      });
      for (const old of abandoned) {
        await rm(join(dirs.audio, old.id), { force: true });
        await rm(join(dirs.video, old.id), { force: true });
      }

      const asset = await db.mediaAsset.create({
        data: {
          episodeId,
          kind,
          provider: kind === 'VIDEO' ? 'BUNNY_STREAM' : 'BUNNY_STORAGE',
          path: PENDING_PATH,
          status: 'UPLOADING',
        },
      });
      // Audio: ids only in the storage path (file names may be Mongolian, the signer wants ASCII).
      // Video: the job stores the Stream video id once Bunny has created it.
      if (kind === 'AUDIO') {
        await db.mediaAsset.update({
          where: { id: asset.id },
          data: { path: `audio/${episodeId}/${asset.id}.${extension}` },
        });
      }

      const actor = req.headers.get(ADMIN_HEADER);
      if (actor) {
        const action =
          kind === 'VIDEO' ? 'episode.video_upload_start' : 'episode.audio_upload_start';
        await audit(db, actor, action, 'Episode', episodeId, {
          assetId: asset.id,
          sizeBytes: upload.size,
        });
      }
      return { metadata: { ...upload.metadata, assetId: asset.id } };
    },

    async onUploadFinish(req, upload) {
      const assetId = upload.metadata?.assetId;
      const asset = assetId ? await db.mediaAsset.findUnique({ where: { id: assetId } }) : null;
      if (!asset) throw reject(mn.errors.UPLOAD_REJECTED);

      const folder = asset.kind === 'VIDEO' ? dirs.video : dirs.audio;
      await mkdir(folder, { recursive: true });
      await rename(join(dirs.tus, upload.id), join(folder, asset.id));
      await store.configstore.delete(upload.id);

      await db.$transaction(async (tx) => {
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { status: 'PROCESSING', failReason: null, sizeBytes: BigInt(upload.size ?? 0) },
        });
        await enqueueMediaUpload(tx, asset.kind, asset.id);
        const actor = req.headers.get(ADMIN_HEADER);
        if (actor) {
          const action =
            asset.kind === 'VIDEO' ? 'episode.video_uploaded' : 'episode.audio_uploaded';
          await audit(tx, actor, action, 'Episode', asset.episodeId, {
            assetId: asset.id,
            sizeBytes: upload.size ?? 0,
          });
        }
      });
      return {};
    },
  });

  return { server, store, cleanUpExpired: () => server.cleanUpExpiredUploads() };
}

export type TusUploads = ReturnType<typeof createTusServer>;
