import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authApp } from './auth-helpers';
import { call, makeAdmin, makeMember, multipart } from './admin-helpers';
import { makeCategory, makeEpisode, makeSeries, makeTag } from './catalog-helpers';
import { listeningApp, pngImage, runMediaJobs } from './content-helpers';
import { testDb } from './helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

const SERIES_ROUTES: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string, unknown?]> = [
  ['GET', '/v1/admin/series'],
  ['POST', '/v1/admin/series', { title: 'Цуврал', slug: 'tsuvral' }],
  ['GET', '/v1/admin/series/x'],
  ['PATCH', '/v1/admin/series/x', { title: 'Шинэ' }],
  ['DELETE', '/v1/admin/series/x'],
  ['POST', '/v1/admin/series/x/reorder', { episodeIds: ['a'] }],
  ['POST', '/v1/admin/series/x/cover'],
];

/** An episode in a series with a part, made straight in the DB. */
async function inSeries(seriesId: string, part: number | null, categoryId?: string) {
  const category = categoryId ? { id: categoryId } : await makeCategory();
  const episode = await makeEpisode(category.id);
  await testDb.episode.update({ where: { id: episode.id }, data: { seriesId, seriesPart: part } });
  return episode;
}

describe('series access', () => {
  it('every series route needs an admin', async () => {
    for (const [method, url, body] of SERIES_ROUTES) {
      const res = await call(app, method, url, undefined, body);
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    const member = await makeMember(app);
    for (const [method, url, body] of SERIES_ROUTES) {
      const res = await call(app, method, url, member.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('an admin can create, list, read, update a series', async () => {
    const admin = await makeAdmin(app);
    const created = await call(app, 'POST', '/v1/admin/series', admin.accessToken, {
      title: 'Эхний цуврал',
      slug: 'ekhnii',
    });
    expect(created.statusCode).toBe(201);
    const { series } = created.json();
    expect(series).toMatchObject({
      title: 'Эхний цуврал',
      slug: 'ekhnii',
      description: '',
      coverUrl: null,
      episodeCount: 0,
    });
    const dup = await call(app, 'POST', '/v1/admin/series', admin.accessToken, {
      title: 'Өөр',
      slug: 'ekhnii',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('SLUG_TAKEN');

    const patched = await call(app, 'PATCH', `/v1/admin/series/${series.id}`, admin.accessToken, {
      description: 'Тайлбар',
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().series.description).toBe('Тайлбар');
    const empty = await call(app, 'PATCH', `/v1/admin/series/${series.id}`, admin.accessToken, {});
    expect(empty.statusCode).toBe(400);

    const list = await call(app, 'GET', '/v1/admin/series', admin.accessToken);
    expect(list.json().series).toHaveLength(1);
    const one = await call(app, 'GET', `/v1/admin/series/${series.id}`, admin.accessToken);
    expect(one.json().series.episodes).toEqual([]);
    expect(
      (await call(app, 'GET', '/v1/admin/series/nope', admin.accessToken)).statusCode,
    ).toBe(404);
    expect(await testDb.auditLog.count({ where: { action: 'series.create' } })).toBe(1);
  });
});

describe('items in a series', () => {
  it('an item created in a series without a part gets the next part', async () => {
    const admin = await makeAdmin(app);
    const series = await makeSeries();
    await inSeries(series.id, 1);
    await inSeries(series.id, 2);
    const category = await makeCategory();
    const res = await call(app, 'POST', '/v1/admin/episodes', admin.accessToken, {
      title: 'Гурав',
      categoryId: category.id,
      seriesId: series.id,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().episode.seriesPart).toBe(3);
    expect(res.json().episode.series).toEqual({ id: series.id, title: series.title });
  });

  it('a taken part gives 409 SERIES_PART_TAKEN and writes nothing', async () => {
    const admin = await makeAdmin(app);
    const series = await makeSeries();
    await inSeries(series.id, 1);
    const category = await makeCategory();
    const before = await testDb.episode.count();
    const res = await call(app, 'POST', '/v1/admin/episodes', admin.accessToken, {
      title: 'Давхар',
      categoryId: category.id,
      seriesId: series.id,
      seriesPart: 1,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SERIES_PART_TAKEN');
    expect(await testDb.episode.count()).toBe(before);
    expect(await testDb.auditLog.count({ where: { action: 'episode.create' } })).toBe(0);
  });

  it('moving an item into a series via PATCH takes the next part; out clears the part', async () => {
    const admin = await makeAdmin(app);
    const series = await makeSeries();
    await inSeries(series.id, 5);
    const category = await makeCategory();
    const episode = await makeEpisode(category.id);
    const into = await call(app, 'PATCH', `/v1/admin/episodes/${episode.id}`, admin.accessToken, {
      seriesId: series.id,
    });
    expect(into.statusCode).toBe(200);
    expect(into.json().episode.seriesPart).toBe(6);
    const out = await call(app, 'PATCH', `/v1/admin/episodes/${episode.id}`, admin.accessToken, {
      seriesId: null,
    });
    expect(out.json().episode.series).toBeNull();
    expect(out.json().episode.seriesPart).toBeNull();
    const unknown = await call(app, 'PATCH', `/v1/admin/episodes/${episode.id}`, admin.accessToken, {
      seriesId: 'nope',
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('PATCH sets tags, clears them, and an unknown tag is 404', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const episode = await makeEpisode(category.id);
    const [t1, t2] = [await makeTag(), await makeTag()];
    const url = `/v1/admin/episodes/${episode.id}`;
    const set = await call(app, 'PATCH', url, admin.accessToken, { tagIds: [t1.id, t2.id] });
    expect(set.statusCode).toBe(200);
    expect(set.json().episode.tags.map((t: { id: string }) => t.id).sort()).toEqual(
      [t1.id, t2.id].sort(),
    );
    const bad = await call(app, 'PATCH', url, admin.accessToken, { tagIds: [t1.id, 'nope'] });
    expect(bad.statusCode).toBe(404);
    expect(await testDb.episodeTag.count({ where: { episodeId: episode.id } })).toBe(2);
    const clear = await call(app, 'PATCH', url, admin.accessToken, { tagIds: [] });
    expect(clear.json().episode.tags).toEqual([]);
    expect(await testDb.episodeTag.count()).toBe(0);
  });

  it('the episode DTO carries series, tags, notifyOnPublish (true by default) and pushText', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const tag = await makeTag({ name: 'Шошго' });
    const res = await call(app, 'POST', '/v1/admin/episodes', admin.accessToken, {
      title: 'Шинэ',
      categoryId: category.id,
      tagIds: [tag.id],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().episode).toMatchObject({
      series: null,
      seriesPart: null,
      tags: [{ id: tag.id, name: 'Шошго' }],
      notifyOnPublish: true,
      pushText: null,
    });
    const off = await call(
      app,
      'PATCH',
      `/v1/admin/episodes/${res.json().episode.id}`,
      admin.accessToken,
      { notifyOnPublish: false, pushText: 'Шинэ анги' },
    );
    expect(off.json().episode).toMatchObject({ notifyOnPublish: false, pushText: 'Шинэ анги' });
  });
});

describe('series reorder and delete', () => {
  it('reorder renumbers 1..n; a wrong id set is 400 VALIDATION_ERROR', async () => {
    const admin = await makeAdmin(app);
    const series = await makeSeries();
    const a = await inSeries(series.id, 1);
    const b = await inSeries(series.id, 2);
    const c = await inSeries(series.id, 3);
    const url = `/v1/admin/series/${series.id}/reorder`;
    const res = await call(app, 'POST', url, admin.accessToken, {
      episodeIds: [c.id, a.id, b.id],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().series.episodes.map((e: { id: string }) => e.id)).toEqual([c.id, a.id, b.id]);
    const part = async (id: string) =>
      (await testDb.episode.findUniqueOrThrow({ where: { id } })).seriesPart;
    expect([await part(c.id), await part(a.id), await part(b.id)]).toEqual([1, 2, 3]);

    const missing = await call(app, 'POST', url, admin.accessToken, { episodeIds: [a.id, b.id] });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('VALIDATION_ERROR');
    const foreign = await inSeries((await makeSeries()).id, 1);
    const extra = await call(app, 'POST', url, admin.accessToken, {
      episodeIds: [a.id, b.id, c.id, foreign.id],
    });
    expect(extra.statusCode).toBe(400);
    expect(await part(c.id)).toBe(1);
  });

  it('delete series keeps the items, clearing their series and part', async () => {
    const admin = await makeAdmin(app);
    const series = await makeSeries();
    const a = await inSeries(series.id, 1);
    const res = await call(app, 'DELETE', `/v1/admin/series/${series.id}`, admin.accessToken);
    expect(res.statusCode).toBe(204);
    const row = await testDb.episode.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.seriesId).toBeNull();
    expect(row.seriesPart).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: 'series.delete' } })).toBe(1);
    expect(
      (await call(app, 'DELETE', `/v1/admin/series/${series.id}`, admin.accessToken)).statusCode,
    ).toBe(404);
  });
});

describe('series cover', () => {
  it('stores a 16:9 cover through a job', async () => {
    await app.close();
    const live = await listeningApp();
    app = live.app;
    const admin = await makeAdmin(app);
    const series = await makeSeries();
    const { payload, headers } = await multipart(
      {},
      { name: 'c.png', data: await pngImage(1200, 700), type: 'image/png', field: 'cover' },
    );
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/series/${series.id}/cover`,
      payload,
      headers: { ...headers, authorization: `Bearer ${admin.accessToken}` },
    });
    expect(res.statusCode).toBe(202);
    expect((await testDb.series.findUniqueOrThrow({ where: { id: series.id } })).coverPath).toBeNull();
    await runMediaJobs(live.runtime);
    const stored = await testDb.series.findUniqueOrThrow({ where: { id: series.id } });
    expect(stored.coverPath).toMatch(new RegExp(`^covers/series/${series.id}/[0-9a-f-]{36}\\.webp$`));
    const meta = await sharp(join(live.runtime.dirs.published, stored.coverPath!)).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1280, height: 720 });
    const got = await call(app, 'GET', `/v1/admin/series/${series.id}`, admin.accessToken);
    expect(got.json().series.coverUrl).toEqual(expect.any(String));

    const bad = await call(app, 'POST', `/v1/admin/series/${series.id}/cover`, admin.accessToken);
    expect(bad.statusCode).toBe(400);
  });
});
