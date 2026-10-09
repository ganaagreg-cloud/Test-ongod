import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES } from '@ongod/shared';
import { createMediaJobs } from '../src/media/jobs';
import type { MediaRuntime } from '../src/media/storage';
import { makeAdmin, makeMember, multipart } from './admin-helpers';
import { call } from './admin-helpers';
import {
  listeningApp,
  pngImage,
  runMediaJobs,
  tusClient,
  wavFile,
  type App,
} from './content-helpers';
import { makeCategory } from './catalog-helpers';
import { testDb } from './helpers';

let app: App;
let base: string;
let runtime: MediaRuntime;
let adminToken: string;
let episodeId: string;

beforeEach(async () => {
  ({ app, base, runtime } = await listeningApp());
  adminToken = (await makeAdmin(app)).accessToken;
  const category = await makeCategory();
  episodeId = (
    await testDb.episode.create({
      data: { categoryId: category.id, title: 'Эхний анги', description: '', coverPath: '' },
    })
  ).id;
});
afterEach(async () => {
  await app.close();
});

const audioAssets = () =>
  testDb.mediaAsset.findMany({ where: { episodeId }, orderBy: { id: 'asc' } });
const meta = (filename = 'ep1.wav') => ({ episodeId, filename, filetype: 'audio/wav' });
const logger = pino({ level: 'silent' });
const mediaJob = (type: string) => {
  const defs = createMediaJobs({ db: testDb, storage: runtime.storage, dirs: runtime.dirs });
  return defs.find((d) => d.type === type)!;
};

describe('audio upload over tus (SPEC G, ADR-0010)', () => {
  it('uploads in chunks, moves the file aside, queues the job, and the job stores it and sets READY', async () => {
    const file = wavFile(3);
    const tus = tusClient(base, adminToken);
    const location = await tus.upload(file, meta(), 8 * 1024);
    expect(location).toMatch(/^\/v1\/admin\/uploads\/[\w-]+$/);

    const [asset] = await audioAssets();
    expect(asset).toMatchObject({ kind: 'AUDIO', provider: 'BUNNY_STORAGE', status: 'PROCESSING' });
    expect(Number(asset!.sizeBytes)).toBe(file.length);
    // ASCII ids only in the storage path, whatever the file name was.
    expect(asset!.path).toBe(`audio/${episodeId}/${asset!.id}.wav`);
    // The finished file sits under the asset id; the tus bookkeeping is gone.
    expect(readdirSync(runtime.dirs.audio)).toEqual([asset!.id]);
    expect(readdirSync(runtime.dirs.tus)).toEqual([]);
    expect(
      await testDb.job.count({ where: { type: 'media.audio-upload', status: 'QUEUED' } }),
    ).toBe(1);

    await runMediaJobs(runtime);

    const [ready] = await audioAssets();
    expect(ready).toMatchObject({ status: 'READY', failReason: null, durationSec: 3 });
    expect(existsSync(join(runtime.dirs.published, ready!.path))).toBe(true);
    expect(existsSync(join(runtime.dirs.audio, ready!.id))).toBe(false);
    expect(
      (await testDb.job.findFirstOrThrow({ where: { type: 'media.audio-upload' } })).status,
    ).toBe('DONE');
    expect(await testDb.auditLog.count({ where: { action: 'episode.audio_uploaded' } })).toBe(1);
  });

  it('resumes after the connection drops or the page is refreshed: HEAD tells where to continue', async () => {
    const file = wavFile(3);
    const tus = tusClient(base, adminToken);
    const created = await tus.create(file.length, meta());
    const location = created.headers.get('location')!;

    // Two chunks arrive, then "the page is refreshed".
    const half = Math.floor(file.length / 2);
    expect((await tus.patch(location, 0, file.subarray(0, half))).status).toBe(204);
    expect((await audioAssets())[0]!.status).toBe('UPLOADING');

    const where = await tus.head(location);
    expect(where.status).toBe(200);
    const offset = Number(where.headers.get('upload-offset'));
    expect(offset).toBe(half);

    expect((await tus.patch(location, offset, file.subarray(offset))).status).toBe(204);
    expect((await audioAssets())[0]!.status).toBe('PROCESSING');
    await runMediaJobs(runtime);
    expect((await audioAssets())[0]).toMatchObject({ status: 'READY', durationSec: 3 });
  });

  it('is for admins with TOTP only', async () => {
    const file = wavFile(1);
    expect((await tusClient(base, '').create(file.length, meta())).status).toBe(401);

    const member = await makeMember(app);
    expect((await tusClient(base, member.accessToken).create(file.length, meta())).status).toBe(
      403,
    );

    const noTotp = await makeAdmin(app, { email: 'x@example.com', totp: 'enabled' });
    const blocked = await tusClient(base, noTotp.accessToken).create(file.length, meta());
    expect(blocked.status).toBe(403);
    expect(await audioAssets()).toHaveLength(0);
  });

  it('refuses a wrong file type, an unknown episode, a missing field and a file that is too big', async () => {
    const tus = tusClient(base, adminToken);
    const small = wavFile(1).length;
    expect((await tus.create(small, meta('notes.pdf'))).status).toBe(400);
    expect((await tus.create(small, meta('virus.exe'))).status).toBe(400);
    expect((await tus.create(small, { ...meta(), episodeId: 'does-not-exist' })).status).toBe(404);
    expect((await tus.create(small, { filename: 'a.wav' })).status).toBe(400);
    expect((await tus.create(MAX_AUDIO_BYTES + 1, meta())).status).toBe(413);
    expect(await audioAssets()).toHaveLength(0);
    expect(await testDb.job.count()).toBeGreaterThanOrEqual(0);
  });

  it('accepts mp3, m4a, aac and wav by extension (the file itself is checked by the job)', async () => {
    const tus = tusClient(base, adminToken);
    for (const name of ['a.mp3', 'b.M4A', 'c.aac', 'd.wav']) {
      const res = await tus.create(1000, meta(name));
      expect(res.status, name).toBe(201);
    }
  });

  it('a second upload replaces an unfinished one, and is refused while a file is being stored', async () => {
    const tus = tusClient(base, adminToken);
    await tus.create(1000, meta()); // abandoned
    await tus.create(1000, meta()); // replaces it
    expect(await audioAssets()).toHaveLength(1);

    await testDb.mediaAsset.updateMany({ where: { episodeId }, data: { status: 'PROCESSING' } });
    const busy = await tus.create(1000, meta());
    expect(busy.status).toBe(409);
  });

  it('a new upload replaces the old audio once it is READY: the old asset and its stored file go away', async () => {
    const tus = tusClient(base, adminToken);
    await tus.upload(wavFile(2), meta('first.wav'));
    await runMediaJobs(runtime);
    const first = (await audioAssets())[0]!;
    expect(existsSync(join(runtime.dirs.published, first.path))).toBe(true);

    await tus.upload(wavFile(4), meta('second.wav'));
    // Until the new one is READY the old one keeps playing.
    expect((await audioAssets()).map((a) => a.status).sort()).toEqual(['PROCESSING', 'READY']);
    await runMediaJobs(runtime);

    const after = await audioAssets();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: 'READY', durationSec: 4 });
    expect(after[0]!.id).not.toBe(first.id);
    expect(existsSync(join(runtime.dirs.published, first.path))).toBe(false);
    expect(existsSync(join(runtime.dirs.published, after[0]!.path))).toBe(true);
  });
});

describe('failed audio: the reason, and Retry', () => {
  async function uploadFile(content: Buffer, name = 'bad.wav') {
    await tusClient(base, adminToken).upload(content, meta(name));
    return (await audioAssets())[0]!;
  }
  const retry = () => call(app, 'POST', `/v1/admin/episodes/${episodeId}/media/retry`, adminToken);

  it('a file that is not audio fails with a reason, quietly (no failed-job alert), and keeps the source for Retry', async () => {
    const asset = await uploadFile(Buffer.from('this is not audio at all, just text'.repeat(40)));
    await runMediaJobs(runtime);

    const failed = (await audioAssets())[0]!;
    expect(failed.status).toBe('FAILED');
    expect(failed.failReason).toContain('Аудио файлыг уншиж чадсангүй');
    // The job itself finished: no permanent failure, so no alert email to the owner.
    expect(
      (await testDb.job.findFirstOrThrow({ where: { type: 'media.audio-upload' } })).status,
    ).toBe('DONE');
    expect(existsSync(join(runtime.dirs.audio, asset.id))).toBe(true);
    expect(existsSync(join(runtime.dirs.published, failed.path))).toBe(false);
  });

  it('shows the failure in the admin episode, and Retry puts it back in the queue', async () => {
    await uploadFile(Buffer.from('not audio'.repeat(100)));
    await runMediaJobs(runtime);

    const shown = (await call(app, 'GET', `/v1/admin/episodes/${episodeId}`, adminToken)).json()
      .episode;
    expect(shown.media).toMatchObject({
      status: 'FAILED',
      failReason: expect.stringContaining('уншиж'),
    });
    expect(shown.missing).toContain('audio');

    const res = await retry();
    expect(res.statusCode).toBe(200);
    expect(res.json().episode.media).toMatchObject({ status: 'PROCESSING', failReason: null });
    expect(
      await testDb.job.count({ where: { type: 'media.audio-upload', status: 'QUEUED' } }),
    ).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: 'episode.media_retry' } })).toBe(1);
  });

  it('a storage outage retries by itself, then fails with a reason; Retry succeeds once storage is back', async () => {
    const asset = await uploadFile(wavFile(2), 'good.wav');
    let broken = true;
    const flaky = {
      ...runtime.storage,
      async putFile(path: string, file: string, type: string) {
        if (broken) throw new Error('Bunny storage upload failed with HTTP 503');
        return runtime.storage.putFile(path, file, type);
      },
    };
    const job = createMediaJobs({ db: testDb, storage: flaky, dirs: runtime.dirs }).find(
      (d) => d.type === 'media.audio-upload',
    )!;
    const run = (attempt: number) =>
      job.handle({ assetId: asset.id }, { db: testDb, log: logger, jobId: 'j', attempt });

    // Attempts 1 and 2: the error is thrown (the queue retries) and the asset is still PROCESSING.
    for (const attempt of [1, 2]) {
      await expect(run(attempt)).rejects.toThrow('503');
      expect((await audioAssets())[0]!.status).toBe('PROCESSING');
    }
    // The last attempt marks it FAILED with a reason for the admin, and still throws (an alert).
    await expect(run(3)).rejects.toThrow('503');
    const failed = (await audioAssets())[0]!;
    expect(failed.status).toBe('FAILED');
    expect(failed.failReason).toContain('Хадгалах сервертэй холбогдож чадсангүй');

    broken = false;
    expect((await retry()).statusCode).toBe(200);
    await run(1);
    expect((await audioAssets())[0]).toMatchObject({
      status: 'READY',
      failReason: null,
      durationSec: 2,
    });
  });

  it('Retry needs a FAILED asset; a missing source file fails with its own reason', async () => {
    expect((await retry()).statusCode).toBe(409); // no asset at all

    const asset = await uploadFile(wavFile(1), 'x.wav');
    expect((await retry()).statusCode).toBe(409); // PROCESSING, not FAILED

    await testDb.mediaAsset.update({ where: { id: asset.id }, data: { status: 'FAILED' } });
    writeFileSync(join(runtime.dirs.audio, 'placeholder'), '');
    await (await import('node:fs/promises')).rm(join(runtime.dirs.audio, asset.id));
    expect((await retry()).statusCode).toBe(200);
    await runMediaJobs(runtime);
    expect((await audioAssets())[0]).toMatchObject({
      status: 'FAILED',
      failReason: expect.stringContaining('Эх файл олдсонгүй'),
    });
  });

  it('running the job twice (a crash after the work) is harmless', async () => {
    const asset = await uploadFile(wavFile(2), 'twice.wav');
    const run = () =>
      mediaJob('media.audio-upload').handle(
        { assetId: asset.id },
        { db: testDb, log: logger, jobId: 'j', attempt: 1 },
      );
    await run();
    await run();
    expect(await audioAssets()).toHaveLength(1);
    expect((await audioAssets())[0]!.status).toBe('READY');
  });
});

describe('cover upload', () => {
  const upload = async (image: Buffer, name = 'cover.png', type = 'image/png') => {
    const { payload, headers } = await multipart({}, { name, data: image, type, field: 'cover' });
    return app.inject({
      method: 'POST',
      url: `/v1/admin/episodes/${episodeId}/cover`,
      payload,
      headers: { ...headers, authorization: `Bearer ${adminToken}` },
    });
  };
  const coverPath = async () =>
    (await testDb.episode.findUniqueOrThrow({ where: { id: episodeId } })).coverPath;

  it('makes a 1400 and a 400 square WebP (centre-cropped), queues the job, and the job stores both', async () => {
    const res = await upload(await pngImage(1200, 700));
    expect(res.statusCode).toBe(202);
    expect(await coverPath()).toBe(''); // not stored yet

    expect(readdirSync(runtime.dirs.covers).sort()).toEqual([
      expect.stringMatching(/-1400\.webp$/),
      expect.stringMatching(/-400\.webp$/),
    ]);
    await runMediaJobs(runtime);

    const path = await coverPath();
    expect(path).toMatch(new RegExp(`^covers/${episodeId}/[0-9a-f-]{36}\\.webp$`));
    const full = await sharp(join(runtime.dirs.published, path)).metadata();
    expect(full).toMatchObject({ format: 'webp', width: 1400, height: 1400 });
    const thumb = await sharp(
      join(runtime.dirs.published, path.replace('.webp', '-400.webp')),
    ).metadata();
    expect(thumb).toMatchObject({ format: 'webp', width: 400, height: 400 });
    // The working copies are cleaned up.
    expect(readdirSync(runtime.dirs.covers)).toEqual([]);
    expect(
      (await call(app, 'GET', `/v1/admin/episodes/${episodeId}`, adminToken)).json().episode
        .hasCover,
    ).toBe(true);
  });

  it('a new cover replaces the old one and the old files are deleted', async () => {
    await upload(await pngImage(500, 500));
    await runMediaJobs(runtime);
    const first = await coverPath();

    await upload(await pngImage(600, 600, '#D4AF6A'));
    await runMediaJobs(runtime);
    const second = await coverPath();
    expect(second).not.toBe(first);
    expect(existsSync(join(runtime.dirs.published, first))).toBe(false);
    expect(existsSync(join(runtime.dirs.published, first.replace('.webp', '-400.webp')))).toBe(
      false,
    );
    expect(existsSync(join(runtime.dirs.published, second))).toBe(true);
  });

  it('accepts JPEG and WebP; refuses text, GIF and truncated images by their bytes: 400 COVER_INVALID', async () => {
    const jpeg = await sharp(await pngImage())
      .jpeg()
      .toBuffer();
    const webp = await sharp(await pngImage())
      .webp()
      .toBuffer();
    expect((await upload(jpeg, 'a.jpg', 'image/jpeg')).statusCode).toBe(202);
    expect((await upload(webp, 'a.webp', 'image/webp')).statusCode).toBe(202);

    for (const bad of [
      Buffer.from('plain text'),
      Buffer.from('GIF89a......'),
      (await pngImage()).subarray(0, 40), // PNG signature, then garbage
    ]) {
      const res = await upload(bad, 'x.png', 'image/png');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('COVER_INVALID');
    }
  });

  it('refuses more than 10 MB (413) and a missing episode (404), and needs an admin', async () => {
    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(10 * 1024 * 1024 + 1),
    ]);
    const res = await upload(big);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('COVER_TOO_LARGE');

    const { payload, headers } = await multipart(
      {},
      { name: 'c.png', data: await pngImage(), type: 'image/png' },
    );
    const missing = await app.inject({
      method: 'POST',
      url: '/v1/admin/episodes/nope/cover',
      payload,
      headers: { ...headers, authorization: `Bearer ${adminToken}` },
    });
    expect(missing.statusCode).toBe(404);

    const member = await makeMember(app);
    const forbidden = await app.inject({
      method: 'POST',
      url: `/v1/admin/episodes/${episodeId}/cover`,
      payload,
      headers: { ...headers, authorization: `Bearer ${member.accessToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('refuses an image that expands to an absurd size (decompression bomb)', async () => {
    // 20000 x 20000 = 400 million pixels, a few KB as PNG.
    const bomb = await sharp({
      create: { width: 20000, height: 20000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(10 * 1024 * 1024);
    const res = await upload(bomb);
    expect(res.statusCode).toBe(400);
  });
});
