import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLAY_URL_TTL_MS } from '../src/catalog/media';
import { authApp } from './auth-helpers';
import { call, makeAdmin, makeMember } from './admin-helpers';
import {
  catalogApp,
  DAY,
  makeCategory,
  makeEpisode,
  makePlaylist,
  makeSeries,
  makeTag,
  testSigner,
  testStreamSigner,
} from './catalog-helpers';
import { testDb } from './helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

const TOOL_ROUTES: Array<['GET' | 'POST', string, unknown?]> = [
  ['POST', '/v1/admin/episodes/x/duplicate'],
  ['POST', '/v1/admin/episodes/x/preview'],
  ['POST', '/v1/admin/episodes/bulk', { ids: ['a'], action: { type: 'archive' } }],
];

const listIds = async (token: string, query: string) => {
  const res = await call(app, 'GET', `/v1/admin/episodes?${query}`, token);
  expect(res.statusCode).toBe(200);
  return (res.json().items as Array<{ id: string }>).map((i) => i.id).sort();
};

const auditCount = (action: string) => testDb.auditLog.count({ where: { action } });

describe('access', () => {
  it('duplicate, preview and bulk need an admin', async () => {
    for (const [method, url, body] of TOOL_ROUTES) {
      const res = await call(app, method, url, undefined, body);
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    const member = await makeMember(app);
    for (const [method, url, body] of TOOL_ROUTES) {
      const res = await call(app, method, url, member.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });
});

describe('list filters', () => {
  it('filters by series, tag, playlist and media status', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const series = await makeSeries();
    const tag = await makeTag();
    const playlist = await makePlaylist();
    const inSeries = await makeEpisode(category.id, { status: 'DRAFT' });
    const tagged = await makeEpisode(category.id, { status: 'DRAFT' });
    const listed = await makeEpisode(category.id, { status: 'DRAFT' });
    const failed = await makeEpisode(category.id, { status: 'DRAFT', media: 'FAILED' });
    const bare = await makeEpisode(category.id, { status: 'DRAFT', media: 'NONE' });
    await testDb.episode.update({
      where: { id: inSeries.id },
      data: { seriesId: series.id, seriesPart: 1 },
    });
    await testDb.episodeTag.create({ data: { episodeId: tagged.id, tagId: tag.id } });
    await testDb.playlistItem.create({
      data: { playlistId: playlist.id, episodeId: listed.id, position: 1 },
    });

    expect(await listIds(admin.accessToken, `seriesId=${series.id}`)).toEqual([inSeries.id]);
    expect(await listIds(admin.accessToken, `tagId=${tag.id}`)).toEqual([tagged.id]);
    expect(await listIds(admin.accessToken, `playlistId=${playlist.id}`)).toEqual([listed.id]);
    expect(await listIds(admin.accessToken, 'mediaStatus=FAILED')).toEqual([failed.id]);
    expect(await listIds(admin.accessToken, 'mediaStatus=NONE')).toEqual([bare.id]);
  });

  it('sorts by published, newest first', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const older = await makeEpisode(category.id, { publishedAt: new Date('2026-01-01T00:00:00Z') });
    const newer = await makeEpisode(category.id, { publishedAt: new Date('2026-02-01T00:00:00Z') });
    const res = await call(app, 'GET', '/v1/admin/episodes?sort=published', admin.accessToken);
    expect(res.json().items.map((i: { id: string }) => i.id)).toEqual([newer.id, older.id]);
  });

  it('from/to returns items scheduled or published in range (from inclusive, to exclusive)', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const scheduled = await makeEpisode(category.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date('2026-11-05T10:00:00Z'),
    });
    const published = await makeEpisode(category.id, {
      publishedAt: new Date('2026-11-10T10:00:00Z'),
    });
    const onFrom = await makeEpisode(category.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date('2026-11-01T00:00:00Z'),
    });
    await makeEpisode(category.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date('2026-12-01T00:00:00Z'),
    });
    await makeEpisode(category.id, { publishedAt: new Date('2026-10-31T23:59:59Z') });
    await makeEpisode(category.id, { status: 'DRAFT' });
    const got = await listIds(
      admin.accessToken,
      'from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z',
    );
    expect(got).toEqual([scheduled.id, published.id, onFrom.id].sort());
  });

  it('from and to come together and span at most 62 days', async () => {
    const admin = await makeAdmin(app);
    for (const query of [
      'from=2026-11-01T00:00:00Z',
      'to=2026-12-01T00:00:00Z',
      'from=2026-11-01T00:00:00Z&to=2027-02-01T00:00:00Z',
      'from=2026-12-01T00:00:00Z&to=2026-11-01T00:00:00Z',
    ]) {
      const res = await call(app, 'GET', `/v1/admin/episodes?${query}`, admin.accessToken);
      expect(res.statusCode, query).toBe(400);
    }
    const ok = await call(
      app,
      'GET',
      '/v1/admin/episodes?from=2026-11-01T00:00:00Z&to=2027-01-02T00:00:00Z',
      admin.accessToken,
    );
    expect(ok.statusCode).toBe(200);
  });
});

describe('duplicate', () => {
  it('copies text, category, series (no part), tags and notify fields as a bare draft', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const series = await makeSeries();
    const tag = await makeTag();
    const source = await makeEpisode(category.id, {
      title: 'Эх',
      description: 'Тайлбар',
      status: 'PUBLISHED',
    });
    await testDb.episode.update({
      where: { id: source.id },
      data: { seriesId: series.id, seriesPart: 3, notifyOnPublish: false, pushText: 'Мэдэгдэл' },
    });
    await testDb.episodeTag.create({ data: { episodeId: source.id, tagId: tag.id } });

    const res = await call(
      app,
      'POST',
      `/v1/admin/episodes/${source.id}/duplicate`,
      admin.accessToken,
    );
    expect(res.statusCode).toBe(201);
    const { episode } = res.json();
    expect(episode).toMatchObject({
      title: 'Эх (хуулбар)',
      description: 'Тайлбар',
      status: 'DRAFT',
      category: { id: category.id },
      series: { id: series.id },
      seriesPart: null,
      notifyOnPublish: false,
      pushText: 'Мэдэгдэл',
      hasCover: false,
      media: null,
      publishedAt: null,
      scheduledFor: null,
    });
    expect(episode.tags.map((t: { id: string }) => t.id)).toEqual([tag.id]);
    expect(episode.id).not.toBe(source.id);
    expect(await auditCount('episode.duplicate')).toBe(1);
    const row = await testDb.episode.findUniqueOrThrow({ where: { id: episode.id } });
    expect(row.coverPath).toBe('');
    expect(await testDb.mediaAsset.count({ where: { episodeId: episode.id } })).toBe(0);
  });

  it('404 for an unknown episode', async () => {
    const admin = await makeAdmin(app);
    const res = await call(app, 'POST', '/v1/admin/episodes/nope/duplicate', admin.accessToken);
    expect(res.statusCode).toBe(404);
  });
});

describe('preview', () => {
  it('signs an audio URL for a DRAFT with READY media, uncached', async () => {
    await app.close();
    const fixed = await catalogApp();
    app = fixed.app;
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const draft = await makeEpisode(category.id, { status: 'DRAFT' });
    const asset = await testDb.mediaAsset.findFirstOrThrow({ where: { episodeId: draft.id } });

    const res = await call(
      app,
      'POST',
      `/v1/admin/episodes/${draft.id}/preview`,
      admin.accessToken,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    const expiresAt = new Date(fixed.now.getTime() + PLAY_URL_TTL_MS);
    expect(res.json()).toEqual({
      kind: 'AUDIO',
      url: testSigner.signUrl({ path: `/${asset.path}`, expiresAt }),
      expiresAt: expiresAt.toISOString(),
    });
  });

  it('signs an HLS URL for a video', async () => {
    await app.close();
    const fixed = await catalogApp();
    app = fixed.app;
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const draft = await makeEpisode(category.id, { status: 'DRAFT', kind: 'VIDEO' });
    const asset = await testDb.mediaAsset.findFirstOrThrow({ where: { episodeId: draft.id } });
    const res = await call(
      app,
      'POST',
      `/v1/admin/episodes/${draft.id}/preview`,
      admin.accessToken,
    );
    expect(res.statusCode).toBe(200);
    const expiresAt = new Date(fixed.now.getTime() + PLAY_URL_TTL_MS);
    expect(res.json()).toEqual({
      kind: 'VIDEO',
      url: testStreamSigner.signUrl({
        path: `/${asset.path}/playlist.m3u8`,
        tokenPath: `/${asset.path}/`,
        inPath: true,
        expiresAt,
      }),
      expiresAt: expiresAt.toISOString(),
    });
  });

  it('409 MEDIA_NOT_READY without READY media', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    for (const media of ['PROCESSING', 'NONE'] as const) {
      const ep = await makeEpisode(category.id, { status: 'DRAFT', media });
      const res = await call(app, 'POST', `/v1/admin/episodes/${ep.id}/preview`, admin.accessToken);
      expect(res.statusCode, media).toBe(409);
      expect(res.json().error.code).toBe('MEDIA_NOT_READY');
    }
  });

  it('404 for an unknown episode', async () => {
    const admin = await makeAdmin(app);
    const res = await call(app, 'POST', '/v1/admin/episodes/nope/preview', admin.accessToken);
    expect(res.statusCode).toBe(404);
  });
});

describe('bulk', () => {
  const bulk = (token: string, ids: string[], action: unknown) =>
    call(app, 'POST', '/v1/admin/episodes/bulk', token, { ids, action });

  it('setCategory updates all and writes one audit row per item', async () => {
    const admin = await makeAdmin(app);
    const from = await makeCategory();
    const to = await makeCategory();
    const a = await makeEpisode(from.id, { status: 'DRAFT' });
    const b = await makeEpisode(from.id, { status: 'DRAFT' });
    const res = await bulk(admin.accessToken, [a.id, b.id], {
      type: 'setCategory',
      categoryId: to.id,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updated: 2 });
    expect(await testDb.episode.count({ where: { categoryId: to.id } })).toBe(2);
    expect(await auditCount('episode.update')).toBe(2);
  });

  it('addTag / removeTag are idempotent per item, one audit row each', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const tag = await makeTag();
    const has = await makeEpisode(category.id, { status: 'DRAFT' });
    const lacks = await makeEpisode(category.id, { status: 'DRAFT' });
    await testDb.episodeTag.create({ data: { episodeId: has.id, tagId: tag.id } });

    const add = await bulk(admin.accessToken, [has.id, lacks.id], {
      type: 'addTag',
      tagId: tag.id,
    });
    expect(add.statusCode).toBe(200);
    expect(await testDb.episodeTag.count({ where: { tagId: tag.id } })).toBe(2);
    expect(await auditCount('episode.tag-add')).toBe(2);

    await testDb.episodeTag.delete({
      where: { episodeId_tagId: { episodeId: lacks.id, tagId: tag.id } },
    });
    const remove = await bulk(admin.accessToken, [has.id, lacks.id], {
      type: 'removeTag',
      tagId: tag.id,
    });
    expect(remove.json()).toEqual({ updated: 2 });
    expect(await testDb.episodeTag.count({ where: { tagId: tag.id } })).toBe(0);
    expect(await auditCount('episode.tag-remove')).toBe(2);
  });

  it('addToPlaylist appends in the same request, skipping episodes already in', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const playlist = await makePlaylist();
    const a = await makeEpisode(category.id);
    const b = await makeEpisode(category.id);
    await testDb.playlistItem.create({
      data: { playlistId: playlist.id, episodeId: a.id, position: 1 },
    });
    const res = await bulk(admin.accessToken, [a.id, b.id], {
      type: 'addToPlaylist',
      playlistId: playlist.id,
    });
    expect(res.statusCode).toBe(200);
    const items = await testDb.playlistItem.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
    });
    expect(items.map((i) => [i.episodeId, i.position])).toEqual([
      [a.id, 1],
      [b.id, 2],
    ]);
  });

  it('addToPlaylist works for the featured playlist before it exists', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const a = await makeEpisode(category.id);
    const res = await bulk(admin.accessToken, [a.id], {
      type: 'addToPlaylist',
      playlistId: 'featured',
    });
    expect(res.statusCode).toBe(200);
    expect(await testDb.playlistItem.count({ where: { playlistId: 'featured' } })).toBe(1);
  });

  it('publish publishes everything ready, one audit row per item', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const a = await makeEpisode(category.id, { status: 'DRAFT' });
    const b = await makeEpisode(category.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date(Date.now() + DAY),
    });
    const res = await bulk(admin.accessToken, [a.id, b.id], { type: 'publish' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updated: 2 });
    const rows = await testDb.episode.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.every((r) => r.status === 'PUBLISHED' && r.publishedAt && !r.scheduledFor)).toBe(
      true,
    );
    expect(await auditCount('episode.publish')).toBe(2);
  });

  it('archive archives published items', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const a = await makeEpisode(category.id);
    const res = await bulk(admin.accessToken, [a.id], { type: 'archive' });
    expect(res.json()).toEqual({ updated: 1 });
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
      'ARCHIVED',
    );
    expect(await auditCount('episode.archive')).toBe(1);
  });

  it('one unknown id: 404, nothing changed, no audit rows', async () => {
    const admin = await makeAdmin(app);
    const from = await makeCategory();
    const to = await makeCategory();
    const a = await makeEpisode(from.id, { status: 'DRAFT' });
    const res = await bulk(admin.accessToken, [a.id, 'nope'], {
      type: 'setCategory',
      categoryId: to.id,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.details).toEqual({ ids: ['nope'] });
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: a.id } })).categoryId).toBe(
      from.id,
    );
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it('unknown category, tag or playlist: 404', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const a = await makeEpisode(category.id, { status: 'DRAFT' });
    for (const action of [
      { type: 'setCategory', categoryId: 'nope' },
      { type: 'addTag', tagId: 'nope' },
      { type: 'removeTag', tagId: 'nope' },
      { type: 'addToPlaylist', playlistId: 'nope' },
    ]) {
      const res = await bulk(admin.accessToken, [a.id], action);
      expect(res.statusCode, action.type).toBe(404);
    }
  });

  it('publish with one item missing a cover: 409 NOT_READY_TO_PUBLISH with ids, nothing published', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const ok = await makeEpisode(category.id, { status: 'DRAFT' });
    const bad = await makeEpisode(category.id, { status: 'DRAFT', coverPath: '' });
    const res = await bulk(admin.accessToken, [ok.id, bad.id], { type: 'publish' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NOT_READY_TO_PUBLISH');
    expect(res.json().error.details).toEqual({ ids: [bad.id] });
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe('DRAFT');
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it('publish with an already published item: 409 EPISODE_STATE, nothing published', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const draft = await makeEpisode(category.id, { status: 'DRAFT' });
    const live = await makeEpisode(category.id);
    const res = await bulk(admin.accessToken, [draft.id, live.id], { type: 'publish' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EPISODE_STATE');
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
      'DRAFT',
    );
  });

  it('archive with one DRAFT: 409 EPISODE_STATE, nothing archived', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const live = await makeEpisode(category.id);
    const draft = await makeEpisode(category.id, { status: 'DRAFT' });
    const res = await bulk(admin.accessToken, [live.id, draft.id], { type: 'archive' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EPISODE_STATE');
    expect(res.json().error.details).toEqual({ ids: [draft.id] });
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: live.id } })).status).toBe(
      'PUBLISHED',
    );
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it('more than 100 ids, no ids, or an unknown action: 400', async () => {
    const admin = await makeAdmin(app);
    const many = Array.from({ length: 101 }, (_, i) => `id${i}`);
    expect((await bulk(admin.accessToken, many, { type: 'archive' })).statusCode).toBe(400);
    expect((await bulk(admin.accessToken, [], { type: 'archive' })).statusCode).toBe(400);
    expect((await bulk(admin.accessToken, ['a'], { type: 'delete' })).statusCode).toBe(400);
  });
});

describe('free items', () => {
  it('creates an item as paid by default', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const res = await call(app, 'POST', '/v1/admin/episodes', admin.accessToken, {
      title: 'Шинэ',
      description: 'Тайлбар',
      categoryId: category.id,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().episode.isFree).toBe(false);
  });

  it('an admin marks an item free and back', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const item = await makeEpisode(category.id, { status: 'DRAFT' });
    const url = `/v1/admin/episodes/${item.id}`;
    const on = await call(app, 'PATCH', url, admin.accessToken, { isFree: true });
    expect(on.statusCode).toBe(200);
    expect(on.json().episode.isFree).toBe(true);
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: item.id } })).isFree).toBe(true);
    const off = await call(app, 'PATCH', url, admin.accessToken, { isFree: false });
    expect(off.json().episode.isFree).toBe(false);
    expect(await auditCount('episode.update')).toBe(2);
  });

  it('a USER cannot set isFree', async () => {
    const member = await makeMember(app);
    const category = await makeCategory();
    const item = await makeEpisode(category.id, { status: 'DRAFT' });
    const res = await call(app, 'PATCH', `/v1/admin/episodes/${item.id}`, member.accessToken, {
      isFree: true,
    });
    expect(res.statusCode).toBe(403);
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: item.id } })).isFree).toBe(false);
  });

  it('duplicate starts paid', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const source = await makeEpisode(category.id, { isFree: true });
    const res = await call(
      app,
      'POST',
      `/v1/admin/episodes/${source.id}/duplicate`,
      admin.accessToken,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().episode.isFree).toBe(false);
  });
});
