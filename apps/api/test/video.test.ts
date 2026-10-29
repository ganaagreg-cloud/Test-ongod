import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_VIDEO_BYTES } from '@ongod/shared';
import { mn } from '../src/i18n/mn';
import { classifyStreamVideo } from '../src/lib/bunnyStream';
import { JobRegistry, PermanentJobError } from '../src/jobs/registry';
import { JobWorker } from '../src/jobs/worker';
import { createMediaJobs, enqueueVideoUpload } from '../src/media/jobs';
import type { MediaRuntime } from '../src/media/storage';
import { call, makeAdmin } from './admin-helpers';
import {
  DAY,
  HOUR,
  MIN,
  authed,
  catalogApp,
  makeCategory,
  makeEpisode,
  memberOn,
  testSigner,
  testStreamSigner,
} from './catalog-helpers';
import {
  fakeStream,
  listeningApp,
  runMediaJobs,
  tusClient,
  wavFile,
  type App,
} from './content-helpers';
import { testDb, testMediaRuntime } from './helpers';

// ADR-0038: one media file per episode, audio or video; video goes through Bunny Stream.

/** A few KB that stand in for an MP4 (the fake Stream does not decode it). */
const videoBytes = () => Buffer.from('fake mp4 '.repeat(2000));
const logger = pino({ level: 'silent' });

describe('video upload over tus, processed by Bunny Stream', () => {
  let app: App;
  let base: string;
  let runtime: MediaRuntime;
  let stream: ReturnType<typeof fakeStream>;
  let adminToken: string;
  let episodeId: string;

  beforeEach(async () => {
    stream = fakeStream({ pollsUntilDone: 2 });
    ({ app, base, runtime } = await listeningApp({
      runtime: { ...testMediaRuntime(), stream: stream.client },
    }));
    adminToken = (await makeAdmin(app)).accessToken;
    const category = await makeCategory();
    episodeId = (
      await testDb.episode.create({
        data: { categoryId: category.id, title: 'Видео анги', description: '', coverPath: '' },
      })
    ).id;
  });
  afterEach(async () => {
    await app.close();
  });

  const assets = () => testDb.mediaAsset.findMany({ where: { episodeId }, orderBy: { id: 'asc' } });
  const meta = (filename = 'ep1.mp4') => ({ episodeId, filename, filetype: 'video/mp4' });
  const upload = (file: Buffer, filename?: string) =>
    tusClient(base, adminToken).upload(file, meta(filename), 4 * 1024);
  const adminEpisode = async () =>
    (await call(app, 'GET', `/v1/admin/episodes/${episodeId}`, adminToken)).json().episode;

  it('stores a video upload, sends it to Stream, follows processing and ends READY with the length', async () => {
    const file = videoBytes();
    await upload(file);

    const [asset] = await assets();
    expect(asset).toMatchObject({
      kind: 'VIDEO',
      provider: 'BUNNY_STREAM',
      status: 'PROCESSING',
      path: 'pending',
    });
    expect(readdirSync(runtime.dirs.video)).toEqual([asset!.id]);
    expect(await testDb.job.count({ where: { type: 'media.video-upload' } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: 'episode.video_uploaded' } })).toBe(1);

    await runMediaJobs(runtime);

    const [ready] = await assets();
    expect(ready).toMatchObject({ status: 'READY', failReason: null, durationSec: 2411 });
    expect(ready!.path).toMatch(/^[0-9a-f-]{36}$/);
    // Bunny got exactly the uploaded bytes, under the episode title.
    const sent = stream.videos.get(ready!.path)!;
    expect(sent.data!.equals(file)).toBe(true);
    expect(sent.title).toBe('Видео анги');
    // The local copy is kept until READY, then removed.
    expect(existsSync(join(runtime.dirs.video, ready!.id))).toBe(false);
    // Processing was checked until Bunny said done (2 "processing" reads, then ready).
    expect(await testDb.job.count({ where: { type: 'media.video-status' } })).toBe(3);

    const episode = await adminEpisode();
    expect(episode.media).toMatchObject({ kind: 'VIDEO', status: 'READY', durationSec: 2411 });
    expect(episode.missing).toEqual(['cover']);
  });

  it("a video without a cover gets Bunny's picture from the video as its cover (ADR-0069)", async () => {
    stream.state.thumbnail = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: '#335544' },
    })
      .jpeg()
      .toBuffer();
    await upload(videoBytes());
    await runMediaJobs(runtime);

    const row = await testDb.episode.findUniqueOrThrow({ where: { id: episodeId } });
    expect(row.coverPath).toMatch(new RegExp(`^covers/${episodeId}/[0-9a-f-]+\\.webp$`));
    expect(existsSync(join(runtime.dirs.published, row.coverPath))).toBe(true);
    const episode = await adminEpisode();
    expect(episode.missing).toEqual([]);
  });

  it('an episode that already has a cover keeps it; no picture from Bunny leaves it empty', async () => {
    stream.state.thumbnail = await sharp({
      create: { width: 640, height: 360, channels: 3, background: '#112233' },
    })
      .jpeg()
      .toBuffer();
    await testDb.episode.update({
      where: { id: episodeId },
      data: { coverPath: 'covers/own.webp' },
    });
    await upload(videoBytes());
    await runMediaJobs(runtime);
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: episodeId } })).coverPath).toBe(
      'covers/own.webp',
    );
    expect(await testDb.job.count({ where: { type: 'media.video-cover' } })).toBe(0);

    // No picture at Bunny: the video is READY, the cover stays empty.
    await testDb.episode.update({ where: { id: episodeId }, data: { coverPath: '' } });
    stream.state.thumbnail = null;
    await upload(videoBytes(), 'ep2.mp4');
    await runMediaJobs(runtime);
    const [ready] = await assets();
    expect(ready).toMatchObject({ status: 'READY' });
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: episodeId } })).coverPath).toBe(
      '',
    );
  });

  it('refuses a file that is neither audio nor video (Mongolian reason) and a video over the limit', async () => {
    const tus = tusClient(base, adminToken);
    const bad = await tus.create(100, meta('slides.pptx'));
    expect(bad.status).toBe(400);
    expect(await bad.text()).toBe(mn.media.unsupportedFile);
    expect((await tus.create(MAX_VIDEO_BYTES + 1, meta())).status).toBe(413);
    expect(await assets()).toHaveLength(0);
  });

  it("Bunny's processing error: FAILED with the reason, the file kept; Retry uses a fresh Stream video", async () => {
    stream.state.outcome = 'failed';
    await upload(videoBytes());
    await runMediaJobs(runtime);

    const [failed] = await assets();
    expect(failed).toMatchObject({ status: 'FAILED', failReason: mn.media.failVideoProcessing });
    expect(existsSync(join(runtime.dirs.video, failed!.id))).toBe(true);
    const firstVideo = failed!.path;

    stream.state.outcome = 'ready';
    const res = await call(app, 'POST', `/v1/admin/episodes/${episodeId}/media/retry`, adminToken);
    expect(res.statusCode).toBe(200);
    await runMediaJobs(runtime);

    const [ready] = await assets();
    expect(ready).toMatchObject({ id: failed!.id, status: 'READY' });
    expect(ready!.path).not.toBe(firstVideo);
    expect(stream.deleted).toContain(firstVideo);
  });

  it('without Bunny Stream settings the video fails with a reason the admin can read (no alert)', async () => {
    const plain = testMediaRuntime();
    const { app: app2, base: base2 } = await listeningApp({ runtime: plain });
    try {
      const token = (await makeAdmin(app2, { email: 'admin2@example.com' })).accessToken;
      await tusClient(base2, token).upload(videoBytes(), meta(), 4 * 1024);
      await runMediaJobs(plain);
      const [asset] = await assets();
      expect(asset).toMatchObject({
        status: 'FAILED',
        failReason: mn.media.failStreamNotConfigured,
      });
      expect(
        (await testDb.job.findFirstOrThrow({ where: { type: 'media.video-upload' } })).status,
      ).toBe('DONE');
    } finally {
      await app2.close();
    }
  });

  it('a Bunny upload error is retried; after the last attempt the asset is FAILED', async () => {
    await upload(videoBytes());
    const [asset] = await assets();
    stream.state.failUploads = 5;
    const job = createMediaJobs({
      db: testDb,
      storage: runtime.storage,
      dirs: runtime.dirs,
      stream: stream.client,
    }).find((d) => d.type === 'media.video-upload')!;
    const ctx = (attempt: number) => ({ db: testDb, log: logger, jobId: 'j', attempt });

    await expect(job.handle({ assetId: asset!.id }, ctx(1))).rejects.toThrow();
    expect((await assets())[0]!.status).toBe('PROCESSING');
    await expect(job.handle({ assetId: asset!.id }, ctx(3))).rejects.toThrow();
    expect((await assets())[0]).toMatchObject({
      status: 'FAILED',
      failReason: mn.media.failStorage,
    });
  });

  it('gives up after 48 hours of processing, and when Bunny no longer has the video', async () => {
    await upload(videoBytes());
    const [asset] = await assets();
    const jobs = createMediaJobs({
      db: testDb,
      storage: runtime.storage,
      dirs: runtime.dirs,
      stream: stream.client,
    });
    const upload1 = jobs.find((d) => d.type === 'media.video-upload')!;
    const status = jobs.find((d) => d.type === 'media.video-status')!;
    const ctx = { db: testDb, log: logger, jobId: 'j', attempt: 1 };
    await upload1.handle({ assetId: asset!.id }, ctx);
    stream.state.pollsUntilDone = 1000;

    // Bunny's free queue can be slow: seven hours of waiting is still fine.
    await status.handle(
      { assetId: asset!.id, startedAt: new Date(Date.now() - 7 * HOUR).toISOString() },
      ctx,
    );
    expect((await assets())[0]).toMatchObject({ status: 'PROCESSING' });

    const longAgo = new Date(Date.now() - 49 * HOUR).toISOString();
    await status.handle({ assetId: asset!.id, startedAt: longAgo }, ctx);
    expect((await assets())[0]).toMatchObject({
      status: 'FAILED',
      failReason: mn.media.failVideoTimeout,
    });

    // Back to PROCESSING by hand; the video then disappears at Bunny.
    await testDb.mediaAsset.update({ where: { id: asset!.id }, data: { status: 'PROCESSING' } });
    stream.videos.clear();
    await status.handle({ assetId: asset!.id, startedAt: new Date().toISOString() }, ctx);
    expect((await assets())[0]).toMatchObject({
      status: 'FAILED',
      failReason: mn.media.failVideoGone,
    });
  });

  it('one file per episode: a video replaces audio, and audio replaces video (deleted where they live)', async () => {
    // READY audio first.
    await tusClient(base, adminToken).upload(wavFile(2), meta('ep.wav'), 8 * 1024);
    await runMediaJobs(runtime);
    const [audio] = await assets();
    expect(audio).toMatchObject({ kind: 'AUDIO', status: 'READY' });
    expect(existsSync(join(runtime.dirs.published, audio!.path))).toBe(true);

    // Video replaces it: only the video row is left and the stored audio file is gone.
    await upload(videoBytes());
    await runMediaJobs(runtime);
    const afterVideo = await assets();
    expect(afterVideo).toHaveLength(1);
    expect(afterVideo[0]).toMatchObject({ kind: 'VIDEO', status: 'READY' });
    expect(existsSync(join(runtime.dirs.published, audio!.path))).toBe(false);

    // Audio replaces the video: the Stream video is deleted at Bunny.
    await tusClient(base, adminToken).upload(wavFile(2), meta('ep2.wav'), 8 * 1024);
    await runMediaJobs(runtime);
    const afterAudio = await assets();
    expect(afterAudio).toHaveLength(1);
    expect(afterAudio[0]).toMatchObject({ kind: 'AUDIO', status: 'READY' });
    expect(stream.deleted).toEqual([afterVideo[0]!.path]);
  });

  it('a new upload over a FAILED video deletes that video at Bunny; deleting a draft deletes its video', async () => {
    stream.state.outcome = 'failed';
    await upload(videoBytes());
    await runMediaJobs(runtime);
    const [failed] = await assets();
    expect(failed!.status).toBe('FAILED');

    stream.state.outcome = 'ready';
    await upload(videoBytes(), 'again.mp4');
    expect(await testDb.job.count({ where: { type: 'media.delete-stream-videos' } })).toBe(1);
    expect(existsSync(join(runtime.dirs.video, failed!.id))).toBe(false);
    await runMediaJobs(runtime);
    expect(stream.deleted).toContain(failed!.path);
    const [ready] = await assets();
    expect(ready!.status).toBe('READY');

    const res = await call(app, 'DELETE', `/v1/admin/episodes/${episodeId}`, adminToken);
    expect(res.statusCode).toBe(204);
    await runMediaJobs(runtime);
    expect(stream.deleted).toContain(ready!.path);
  });

  it('an upload whose worker stopped with no attempts left fails with a reason; a new upload and Retry work (ADR-0045)', async () => {
    await upload(videoBytes());
    const [asset] = await assets();
    expect(asset!.status).toBe('PROCESSING');
    // The process died during the last attempt, three hours ago.
    const job = await testDb.job.findFirstOrThrow({ where: { type: 'media.video-upload' } });
    await testDb.job.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        attempts: job.maxAttempts,
        lockedAt: new Date(Date.now() - 3 * HOUR),
      },
    });
    const registry = new JobRegistry().register(
      ...createMediaJobs({
        db: testDb,
        storage: runtime.storage,
        dirs: runtime.dirs,
        stream: stream.client,
      }),
    );
    expect(await new JobWorker(testDb, registry, logger).claim(0)).toHaveLength(0); // recovery

    expect(await testDb.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'FAILED',
    });
    expect((await assets())[0]).toMatchObject({
      status: 'FAILED',
      failReason: mn.media.failLockTimeout,
    });
    expect((await adminEpisode()).media).toMatchObject({ status: 'FAILED' });

    // No longer PROCESSING: Retry (which needs FAILED) is offered, and a new file is accepted
    // instead of the 409 a stuck PROCESSING asset caused.
    const created = await tusClient(base, adminToken).create(100, meta('again.mp4'));
    expect(created.status).toBe(201);
  });

  describe('a status check that gives up frees the asset (ADR-0045)', () => {
    /** Runs the upload job, which hands over to one status check that runs at once. */
    const statusJob = () => testDb.job.findFirstOrThrow({ where: { type: 'media.video-status' } });

    it('Bunny errors until the attempts run out: FAILED with a reason, and a new upload is accepted', async () => {
      stream.client.getVideo = async () => {
        throw new Error('bunny 500');
      };
      await upload(videoBytes());
      // Last attempt: the status job may run once more.
      await runMediaJobs(runtime);
      const job = await statusJob();
      expect(job.status).toBe('QUEUED');
      await testDb.job.update({
        where: { id: job.id },
        data: { maxAttempts: job.attempts + 1, runAt: new Date(Date.now() - 1000) },
      });
      await runMediaJobs(runtime);

      expect((await statusJob()).status).toBe('FAILED');
      expect((await assets())[0]).toMatchObject({
        status: 'FAILED',
        failReason: mn.media.failJobGaveUp,
      });
      const created = await tusClient(base, adminToken).create(100, meta('again.mp4'));
      expect(created.status).toBe(201);
    });

    it('a permanent error: FAILED at once', async () => {
      stream.client.getVideo = async () => {
        throw new PermanentJobError('cannot ever work');
      };
      await upload(videoBytes());
      await runMediaJobs(runtime);
      expect((await statusJob()).status).toBe('FAILED');
      expect((await assets())[0]).toMatchObject({
        status: 'FAILED',
        failReason: mn.media.failJobGaveUp,
      });
    });

    it('an error with attempts left: still PROCESSING, the check is retried', async () => {
      stream.client.getVideo = async () => {
        throw new Error('bunny 500');
      };
      await upload(videoBytes());
      await runMediaJobs(runtime);
      expect(await statusJob()).toMatchObject({ status: 'QUEUED', attempts: 1 });
      expect((await assets())[0]).toMatchObject({ status: 'PROCESSING', failReason: null });
    });
  });

  it('Retry works after an upload failed by lock timeout (ADR-0045)', async () => {
    await upload(videoBytes());
    const job = await testDb.job.findFirstOrThrow({ where: { type: 'media.video-upload' } });
    await testDb.job.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        attempts: job.maxAttempts,
        lockedAt: new Date(Date.now() - 3 * HOUR),
      },
    });
    const registry = new JobRegistry().register(
      ...createMediaJobs({
        db: testDb,
        storage: runtime.storage,
        dirs: runtime.dirs,
        stream: stream.client,
      }),
    );
    await new JobWorker(testDb, registry, logger).claim(0);
    expect((await assets())[0]!.status).toBe('FAILED');

    const res = await call(app, 'POST', `/v1/admin/episodes/${episodeId}/media/retry`, adminToken);
    expect(res.statusCode).toBe(200);
    await runMediaJobs(runtime);
    expect((await assets())[0]).toMatchObject({ status: 'READY', failReason: null });
  });

  it('a job for a deleted asset or a finished video does nothing', async () => {
    await enqueueVideoUpload(testDb, 'no-such-asset');
    await runMediaJobs(runtime);
    expect(
      (await testDb.job.findFirstOrThrow({ where: { type: 'media.video-upload' } })).status,
    ).toBe('DONE');
    expect(stream.videos.size).toBe(0);
  });
});

describe('Bunny Stream status mapping (TO-VERIFY, R-bunny-stream)', () => {
  const v = (status: number, encodeProgress = 0, length = 0) => ({
    guid: 'g',
    status,
    encodeProgress,
    length,
  });
  it('treats 4, or a finished encode with a length, as ready; 5 and 6 as failed; the rest as processing', () => {
    expect(classifyStreamVideo(v(4))).toBe('ready');
    expect(classifyStreamVideo(v(3, 100, 2400))).toBe('ready');
    expect(classifyStreamVideo(v(3, 100, 0))).toBe('processing');
    expect(classifyStreamVideo(v(5, 100, 2400))).toBe('failed');
    expect(classifyStreamVideo(v(6))).toBe('failed');
    for (const s of [0, 1, 2, 3]) expect(classifyStreamVideo(v(s, 40))).toBe('processing');
  });
});

describe('play and catalog with video episodes', () => {
  let app: App;
  let now: Date;
  beforeEach(async () => {
    ({ app, now } = await catalogApp());
  });
  afterEach(async () => {
    await app.close();
  });
  const play = (episodeId: string, token: string) =>
    authed(app, 'POST', `/v1/episodes/${episodeId}/play`, token);

  it('returns kind VIDEO and the HLS playlist signed with a directory token in the path', async () => {
    const accessUntil = new Date(now.getTime() + 30 * DAY);
    const user = await memberOn(app, { accessUntil });
    const cat = await makeCategory();
    const episode = await makeEpisode(cat.id, { kind: 'VIDEO', durationSec: 2400 });
    const asset = await testDb.mediaAsset.findFirstOrThrow({ where: { episodeId: episode.id } });

    const res = await play(episode.id, user.accessToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const expiresAt = new Date(now.getTime() + 4 * HOUR);
    expect(body).toEqual({
      kind: 'VIDEO',
      url: testStreamSigner.signUrl({
        path: `/${asset.path}/playlist.m3u8`,
        tokenPath: `/${asset.path}/`,
        inPath: true,
        expiresAt,
      }),
      expiresAt: expiresAt.toISOString(),
      durationSec: 2400,
    });
    expect(body.url).toMatch(
      new RegExp(
        `^https://vz-test\\.b-cdn\\.net/bcdn_token=HS256-[\\w-]+&token_path=%2F${asset.path}%2F&expires=\\d+/${asset.path}/playlist\\.m3u8$`,
      ),
    );
  });

  it('keeps every access rule for video, and never signs past the end of access', async () => {
    const cat = await makeCategory();
    const episode = await makeEpisode(cat.id, { kind: 'VIDEO' });

    const none = await memberOn(app, { accessUntil: null, email: 'none@example.com' });
    expect((await play(episode.id, none.accessToken)).json().error.code).toBe('NO_ACCESS');

    const soon = new Date(now.getTime() + 10 * MIN);
    const short = await memberOn(app, { accessUntil: soon, email: 'short@example.com' });
    const res = await play(episode.id, short.accessToken);
    expect(res.json().expiresAt).toBe(soon.toISOString());

    const processing = await makeEpisode(cat.id, { kind: 'VIDEO', media: 'PROCESSING' });
    const notReady = await play(processing.id, short.accessToken);
    expect(notReady.statusCode).toBe(409);
    expect(notReady.json().error.code).toBe('MEDIA_NOT_READY');
  });

  it('audio still plays as before (kind AUDIO, storage pull zone URL)', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const episode = await makeEpisode(cat.id);
    const res = await play(episode.id, user.accessToken);
    expect(res.json().kind).toBe('AUDIO');
    expect(
      res
        .json()
        .url.startsWith(
          `https://${new URL(testSigner.signUrl({ path: '/a', expiresAt: now })).host}/`,
        ),
    ).toBe(true);
  });

  it('catalog items say which kind each episode is (null without a ready file)', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const video = await makeEpisode(cat.id, { kind: 'VIDEO' });
    const audio = await makeEpisode(cat.id);
    const none = await makeEpisode(cat.id, { media: 'NONE' });
    const res = await authed(app, 'GET', '/v1/episodes?limit=50', user.accessToken);
    const kinds = Object.fromEntries(
      res.json().items.map((i: { id: string; mediaKind: string | null }) => [i.id, i.mediaKind]),
    );
    expect(kinds[video.id]).toBe('VIDEO');
    expect(kinds[audio.id]).toBe('AUDIO');
    expect(kinds[none.id]).toBeNull();
  });
});

describe('play without Bunny Stream settings', () => {
  it('answers 503 for video and still plays audio', async () => {
    const { app } = await catalogApp({
      env: {
        BUNNY_STREAM_LIBRARY_ID: '',
        BUNNY_STREAM_API_KEY: '',
        BUNNY_STREAM_CDN_HOSTNAME: '',
        BUNNY_STREAM_TOKEN_KEY: '',
      },
    });
    try {
      const user = await memberOn(app);
      const cat = await makeCategory();
      const video = await makeEpisode(cat.id, { kind: 'VIDEO' });
      const audio = await makeEpisode(cat.id);
      const v = await authed(app, 'POST', `/v1/episodes/${video.id}/play`, user.accessToken);
      expect(v.statusCode).toBe(503);
      const a = await authed(app, 'POST', `/v1/episodes/${audio.id}/play`, user.accessToken);
      expect(a.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
