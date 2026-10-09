import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { ALLOWED_AUDIO_EXTENSIONS, MAX_AUDIO_BYTES } from '@ongod/shared';
import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { audit } from '../admin/audit';
import type { Db } from '../db';
import type { Env } from '../env';
import { mn } from '../i18n/mn';
import { enqueueAudioUpload } from './jobs';
import type { UploadDirs } from './storage';

/** Where the resumable upload endpoint lives (behind the admin guard, see routes/admin-content.ts). */
export const UPLOAD_PATH = '/v1/admin/uploads';
/** The header the route sets (after the guard) so the hooks know which admin is uploading. */
export const ADMIN_HEADER = 'x-admin-user-id';
/** Uploads left unfinished for this long are removed by the cron task. */
const EXPIRY_MS = 7 * 24 * 60 * 60_000;

const reject = (body: string, status_code = 400) => ({ status_code, body });

/**
 * Resumable audio uploads (tus 1.0, ADR-0010). The browser sends the file in chunks and can
 * continue after a refresh or a dropped connection. The flow:
 *   create    -> a MediaAsset row in UPLOADING (validates the episode, file type and size)
 *   finished  -> the file is moved to <uploads>/audio/<assetId>, the asset becomes PROCESSING and
 *                the media.audio-upload job (read length, send to storage, READY or FAILED) is queued
 */
export function createTusServer(deps: { db: Db; dirs: UploadDirs; env: Pick<Env, 'TRUST_PROXY'> }) {
  const { db, dirs } = deps;
  const store = new FileStore({ directory: dirs.tus, expirationPeriodInMilliseconds: EXPIRY_MS });

  const server = new Server({
    path: UPLOAD_PATH,
    datastore: store,
    maxSize: MAX_AUDIO_BYTES,
    // A relative Location works behind any proxy and in the Vite dev server.
    relativeLocation: true,
    respectForwardedHeaders: deps.env.TRUST_PROXY,

    async onUploadCreate(req, upload) {
      const { episodeId, filename } = upload.metadata ?? {};
      const extension = filename?.split('.').pop()?.toLowerCase() ?? '';
      if (!episodeId || !filename) throw reject(mn.errors.UPLOAD_REJECTED);
      if (!(ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
        throw reject(mn.media.failUnreadable);
      }
      if (!upload.size || upload.size > MAX_AUDIO_BYTES) throw reject(mn.errors.UPLOAD_REJECTED);

      const episode = await db.episode.findUnique({
        where: { id: episodeId },
        select: { id: true },
      });
      if (!episode) throw reject(mn.errors.NOT_FOUND, 404);

      // One audio file at a time: a file still being stored blocks a second upload.
      const busy = await db.mediaAsset.count({ where: { episodeId, status: 'PROCESSING' } });
      if (busy > 0) throw reject(mn.errors.EPISODE_STATE, 409);
      // Earlier uploads that never finished are abandoned: this one replaces them.
      await db.mediaAsset.deleteMany({
        where: { episodeId, status: { in: ['UPLOADING', 'FAILED'] } },
      });

      const asset = await db.mediaAsset.create({
        data: {
          episodeId,
          kind: 'AUDIO',
          provider: 'BUNNY_STORAGE',
          path: 'pending',
          status: 'UPLOADING',
        },
      });
      // Ids only in the storage path: file names may be Mongolian and the signer wants ASCII.
      await db.mediaAsset.update({
        where: { id: asset.id },
        data: { path: `audio/${episodeId}/${asset.id}.${extension}` },
      });

      const actor = req.headers.get(ADMIN_HEADER);
      if (actor) {
        await audit(db, actor, 'episode.audio_upload_start', 'Episode', episodeId, {
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

      await mkdir(dirs.audio, { recursive: true });
      await rename(join(dirs.tus, upload.id), join(dirs.audio, asset.id));
      await store.configstore.delete(upload.id);

      await db.$transaction(async (tx) => {
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { status: 'PROCESSING', failReason: null, sizeBytes: BigInt(upload.size ?? 0) },
        });
        await enqueueAudioUpload(tx, asset.id);
        const actor = req.headers.get(ADMIN_HEADER);
        if (actor) {
          await audit(tx, actor, 'episode.audio_uploaded', 'Episode', asset.episodeId, {
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
