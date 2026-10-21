import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DAY,
  authed,
  catalogApp,
  ids,
  makeCategory,
  makeEpisode,
  makePlaylist,
  makeSeries,
  makeTag,
  memberOn,
} from './catalog-helpers';
import { testDb } from './helpers';

let app: FastifyInstance;
let now: Date;

beforeEach(async () => {
  ({ app, now } = await catalogApp());
});
afterEach(async () => {
  await app.close();
});

const get = (url: string, token: string) => authed(app, 'GET', url, token);

const addToPlaylist = (playlistId: string, episodeId: string, position: number) =>
  testDb.playlistItem.create({ data: { playlistId, episodeId, position } });
const tagEpisode = (episodeId: string, tagId: string) =>
  testDb.episodeTag.create({ data: { episodeId, tagId } });
const inSeries = (episodeId: string, seriesId: string, seriesPart: number) =>
  testDb.episode.update({ where: { id: episodeId }, data: { seriesId, seriesPart } });

describe('home rows', () => {
  it('has featured items in playlist order, only published', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    await testDb.playlist.create({
      data: { id: 'featured', title: 'Онцлох', slug: 'featured', isFeatured: true },
    });
    const a = await makeEpisode(cat.id);
    const b = await makeEpisode(cat.id);
    const draft = await makeEpisode(cat.id, { status: 'DRAFT' });
    const archived = await makeEpisode(cat.id, {
      status: 'ARCHIVED',
      publishedAt: new Date(now.getTime() - DAY),
    });
    const future = await makeEpisode(cat.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date(now.getTime() + DAY),
    });
    await addToPlaylist('featured', b.id, 1);
    await addToPlaylist('featured', draft.id, 2);
    await addToPlaylist('featured', a.id, 3);
    await addToPlaylist('featured', archived.id, 4);
    await addToPlaylist('featured', future.id, 5);

    const home = (await get('/v1/home', user.accessToken)).json();
    expect(ids(home.featured)).toEqual([b.id, a.id]);
  });

  it('has an empty featured list when the featured playlist does not exist yet', async () => {
    const user = await memberOn(app);
    const home = (await get('/v1/home', user.accessToken)).json();
    expect(home.featured).toEqual([]);
    expect(await testDb.playlist.count()).toBe(0); // reading never creates it
  });

  it('home playlists: only showOnHome, in homeOrder, empty ones left out', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const second = await makePlaylist({ title: 'Second', showOnHome: true, homeOrder: 2 });
    const first = await makePlaylist({ title: 'First', showOnHome: true, homeOrder: 1 });
    const hidden = await makePlaylist({ title: 'Hidden', showOnHome: false, homeOrder: 0 });
    const onlyDraft = await makePlaylist({ title: 'Drafts', showOnHome: true, homeOrder: 3 });
    const emptyOne = await makePlaylist({ title: 'Empty', showOnHome: true, homeOrder: 4 });
    const e1 = await makeEpisode(cat.id);
    const e2 = await makeEpisode(cat.id);
    const draft = await makeEpisode(cat.id, { status: 'DRAFT' });
    await addToPlaylist(first.id, e2.id, 1);
    await addToPlaylist(first.id, e1.id, 2);
    await addToPlaylist(second.id, e1.id, 1);
    await addToPlaylist(hidden.id, e1.id, 1);
    await addToPlaylist(onlyDraft.id, draft.id, 1);
    void emptyOne;

    const home = (await get('/v1/home', user.accessToken)).json();
    expect(home.playlists.map((p: { title: string }) => p.title)).toEqual(['First', 'Second']);
    expect(ids(home.playlists[0].items)).toEqual([e2.id, e1.id]);
    expect(Object.keys(home.playlists[0]).sort()).toEqual(['id', 'items', 'slug', 'title']);
  });

  it('limits each home playlist to 10 items', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const pl = await makePlaylist({ showOnHome: true, homeOrder: 1 });
    for (let i = 0; i < 12; i++) {
      await addToPlaylist(pl.id, (await makeEpisode(cat.id)).id, i);
    }
    const home = (await get('/v1/home', user.accessToken)).json();
    expect(home.playlists[0].items).toHaveLength(10);
  });

  it('keeps continueListening, latest, categories, thisWeek, nextRelease', async () => {
    const user = await memberOn(app);
    const home = (await get('/v1/home', user.accessToken)).json();
    for (const key of ['continueListening', 'latest', 'categories', 'thisWeek', 'nextRelease']) {
      expect(home, key).toHaveProperty(key);
    }
  });
});

describe('series', () => {
  it('lists only published parts, by part, with real part numbers', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const series = await makeSeries({ title: 'Түүх', description: 'Тайлбар' });
    const p3 = await makeEpisode(cat.id);
    const p1 = await makeEpisode(cat.id);
    const p2 = await makeEpisode(cat.id, { status: 'DRAFT' });
    const p4 = await makeEpisode(cat.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date(now.getTime() + DAY),
    });
    await inSeries(p3.id, series.id, 3);
    await inSeries(p1.id, series.id, 1);
    await inSeries(p2.id, series.id, 2);
    await inSeries(p4.id, series.id, 4);

    const res = await get(`/v1/series/${series.id}`, user.accessToken);
    expect(res.statusCode).toBe(200);
    const body = res.json().series;
    expect(body).toMatchObject({ id: series.id, title: 'Түүх', description: 'Тайлбар' });
    expect(body).toHaveProperty('coverUrl');
    expect(ids(body.items)).toEqual([p1.id, p3.id]);
    expect(body.items.map((i: { series: { part: number } }) => i.series.part)).toEqual([1, 3]);
    expect(JSON.stringify(res.json())).not.toContain(p2.id);
  });

  it('answers 404 for an unknown series or one with nothing published', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const series = await makeSeries();
    const draft = await makeEpisode(cat.id, { status: 'DRAFT' });
    await inSeries(draft.id, series.id, 1);
    for (const id of [series.id, 'nope']) {
      const res = await get(`/v1/series/${id}`, user.accessToken);
      expect(res.statusCode, id).toBe(404);
      expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
    }
  });

  it('detail nextInSeries skips a DRAFT part 2 and returns published part 3', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const series = await makeSeries();
    const p1 = await makeEpisode(cat.id);
    const p2 = await makeEpisode(cat.id, { status: 'DRAFT' });
    const p3 = await makeEpisode(cat.id);
    await inSeries(p1.id, series.id, 1);
    await inSeries(p2.id, series.id, 2);
    await inSeries(p3.id, series.id, 3);

    const first = (await get(`/v1/episodes/${p1.id}`, user.accessToken)).json().episode;
    expect(first.nextInSeries.id).toBe(p3.id);
    expect(first.series).toEqual({ id: series.id, title: series.title, part: 1 });
    const last = (await get(`/v1/episodes/${p3.id}`, user.accessToken)).json().episode;
    expect(last.nextInSeries).toBeNull();
  });

  it('detail nextInSeries is null for an episode outside any series', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const ep = await makeEpisode(cat.id);
    const body = (await get(`/v1/episodes/${ep.id}`, user.accessToken)).json().episode;
    expect(body.nextInSeries).toBeNull();
    expect(body.series).toBeNull();
    expect(body.tags).toEqual([]);
  });
});

describe('playlists', () => {
  it('shows neither a DRAFT nor an ARCHIVED item, in position order', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const pl = await makePlaylist({ title: 'Жагсаалт' });
    const a = await makeEpisode(cat.id);
    const b = await makeEpisode(cat.id);
    const draft = await makeEpisode(cat.id, { status: 'DRAFT' });
    const archived = await makeEpisode(cat.id, {
      status: 'ARCHIVED',
      publishedAt: new Date(now.getTime() - DAY),
    });
    await addToPlaylist(pl.id, b.id, 1);
    await addToPlaylist(pl.id, draft.id, 2);
    await addToPlaylist(pl.id, archived.id, 3);
    await addToPlaylist(pl.id, a.id, 4);

    const res = await get(`/v1/playlists/${pl.id}`, user.accessToken);
    expect(res.statusCode).toBe(200);
    const body = res.json().playlist;
    expect(body).toMatchObject({ id: pl.id, title: 'Жагсаалт', slug: pl.slug });
    expect(body).toHaveProperty('coverUrl');
    expect(ids(body.items)).toEqual([b.id, a.id]);
  });

  it('answers 404 for an unknown playlist or one with nothing published', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const pl = await makePlaylist();
    await addToPlaylist(pl.id, (await makeEpisode(cat.id, { status: 'DRAFT' })).id, 1);
    for (const id of [pl.id, 'nope']) {
      expect((await get(`/v1/playlists/${id}`, user.accessToken)).statusCode, id).toBe(404);
    }
  });
});

describe('tags', () => {
  it('lists a tag on items and filters /episodes by tag slug and by series id', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const tag = await makeTag({ name: 'Домог', slug: 'legend' });
    const other = await makeTag({ slug: 'other' });
    const series = await makeSeries();
    const a = await makeEpisode(cat.id);
    const b = await makeEpisode(cat.id);
    const c = await makeEpisode(cat.id);
    const draftTagged = await makeEpisode(cat.id, { status: 'DRAFT' });
    await tagEpisode(a.id, tag.id);
    await tagEpisode(draftTagged.id, tag.id);
    await tagEpisode(b.id, other.id);
    await inSeries(c.id, series.id, 1);

    const bySlug = (await get('/v1/episodes?tag=legend', user.accessToken)).json();
    expect(ids(bySlug.items)).toEqual([a.id]);
    expect(bySlug.items[0].tags).toEqual([{ id: tag.id, name: 'Домог', slug: 'legend' }]);
    const byId = (await get(`/v1/episodes?tag=${tag.id}`, user.accessToken)).json();
    expect(ids(byId.items)).toEqual([a.id]);
    const bySeries = (await get(`/v1/episodes?series=${series.id}`, user.accessToken)).json();
    expect(ids(bySeries.items)).toEqual([c.id]);
  });

  it('/tags omits a tag used only by drafts', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const live = await makeTag({ name: 'Амьд', slug: 'live' });
    const draftOnly = await makeTag({ name: 'Ноорог', slug: 'draft-only' });
    await tagEpisode((await makeEpisode(cat.id)).id, live.id);
    await tagEpisode((await makeEpisode(cat.id, { status: 'DRAFT' })).id, draftOnly.id);

    const res = await get('/v1/tags', user.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().tags).toEqual([{ id: live.id, name: 'Амьд', slug: 'live' }]);
  });
});

describe('collections access', () => {
  it('needs a signed-in user', async () => {
    for (const url of ['/v1/series/x', '/v1/playlists/x', '/v1/tags']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
    }
  });
});
