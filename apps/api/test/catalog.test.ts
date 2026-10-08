import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DAY,
  HOUR,
  MIN,
  authed,
  catalogApp,
  ids,
  makeCategory,
  makeEpisode,
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

describe('catalog access', () => {
  it('needs a signed-in user, with the standard error shape', async () => {
    for (const url of ['/v1/categories', '/v1/episodes', '/v1/home', '/v1/saved']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
      expect(res.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: expect.any(String) },
      });
    }
    const play = await app.inject({ method: 'POST', url: '/v1/episodes/x/play' });
    expect(play.statusCode).toBe(401);
  });

  it('is visible without paid access (only playback needs access)', async () => {
    const user = await memberOn(app, { accessUntil: null });
    const cat = await makeCategory();
    await makeEpisode(cat.id, { title: 'Visible' });
    const res = await get('/v1/episodes', user.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
  });
});

describe('categories', () => {
  it('counts published episodes only and hides empty categories', async () => {
    const user = await memberOn(app);
    const history = await makeCategory({ name: 'Түүх', slug: 'history', sortOrder: 2 });
    const talks = await makeCategory({ name: 'Ярилцлага', slug: 'talks', sortOrder: 1 });
    const empty = await makeCategory({ name: 'Хоосон', slug: 'empty' });
    const draftOnly = await makeCategory({ name: 'Ноорог', slug: 'drafts' });
    await makeEpisode(history.id);
    await makeEpisode(history.id);
    await makeEpisode(history.id, { status: 'DRAFT' });
    await makeEpisode(history.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date(now.getTime() + DAY),
    });
    await makeEpisode(history.id, {
      status: 'ARCHIVED',
      publishedAt: new Date(now.getTime() - DAY),
    });
    await makeEpisode(talks.id);
    await makeEpisode(draftOnly.id, { status: 'DRAFT' });

    const res = await get('/v1/categories', user.accessToken);
    expect(res.statusCode).toBe(200);
    // Ordered by sortOrder: talks (1) before history (2).
    expect(res.json().categories).toEqual([
      { id: talks.id, name: 'Ярилцлага', slug: 'talks', episodeCount: 1 },
      { id: history.id, name: 'Түүх', slug: 'history', episodeCount: 2 },
    ]);
    expect(JSON.stringify(res.json())).not.toContain(empty.id);
  });
});

describe('episode list', () => {
  it('shows only published, due episodes, newest first, with no price or plan data', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const old = await makeEpisode(cat.id, { publishedAt: new Date(now.getTime() - 3 * DAY) });
    const fresh = await makeEpisode(cat.id, { publishedAt: new Date(now.getTime() - HOUR) });
    await makeEpisode(cat.id, { status: 'DRAFT' });
    await makeEpisode(cat.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date(now.getTime() + HOUR),
    });
    await makeEpisode(cat.id, { status: 'ARCHIVED', publishedAt: new Date(now.getTime() - DAY) });
    // Wrong data (status PUBLISHED but not due yet) must still stay hidden.
    await makeEpisode(cat.id, { publishedAt: new Date(now.getTime() + HOUR) });
    await makeEpisode(cat.id, { publishedAt: null });

    const res = await get('/v1/episodes', user.accessToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(ids(body.items)).toEqual([fresh.id, old.id]);
    expect(body.nextCursor).toBeNull();
    expect(body.items[0]).toMatchObject({
      id: fresh.id,
      title: fresh.title,
      category: { id: cat.id, name: cat.name, slug: cat.slug },
      durationSec: 1800,
      progress: null,
      saved: false,
    });
    expect(new URL(body.items[0].coverUrl).host).toBe('test-zone.b-cdn.net');
    expect(new URL(body.items[0].thumbUrl).pathname).toMatch(/-400\.webp$/);
    // Apps never show prices, bank details, plans or payment buttons.
    expect(JSON.stringify(body)).not.toMatch(/price|plan|amount|bank|mnt/i);
    // Audio paths are never exposed in the catalog; only play returns a (signed) audio URL.
    expect(JSON.stringify(body)).not.toContain('audio.mp3');
  });

  it('sorts by newest, oldest and longest', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const a = await makeEpisode(cat.id, {
      publishedAt: new Date(now.getTime() - 3 * DAY),
      durationSec: 600,
    });
    const b = await makeEpisode(cat.id, {
      publishedAt: new Date(now.getTime() - 2 * DAY),
      durationSec: 3000,
    });
    const c = await makeEpisode(cat.id, {
      publishedAt: new Date(now.getTime() - 1 * DAY),
      durationSec: 1800,
    });
    const noAudio = await makeEpisode(cat.id, {
      publishedAt: new Date(now.getTime() - 4 * DAY),
      media: 'NONE',
    });

    const order = async (sort: string) =>
      ids((await get(`/v1/episodes?sort=${sort}`, user.accessToken)).json().items);
    expect(await order('newest')).toEqual([c.id, b.id, a.id, noAudio.id]);
    expect(await order('oldest')).toEqual([noAudio.id, a.id, b.id, c.id]);
    expect(await order('longest')).toEqual([b.id, c.id, a.id, noAudio.id]);
  });

  it('filters by category id or slug', async () => {
    const user = await memberOn(app);
    const history = await makeCategory({ slug: 'history' });
    const talks = await makeCategory({ slug: 'talks' });
    const h = await makeEpisode(history.id);
    const t = await makeEpisode(talks.id);

    const byId = await get(`/v1/episodes?category=${history.id}`, user.accessToken);
    const bySlug = await get('/v1/episodes?category=talks', user.accessToken);
    const none = await get('/v1/episodes?category=nope', user.accessToken);
    expect(ids(byId.json().items)).toEqual([h.id]);
    expect(ids(bySlug.json().items)).toEqual([t.id]);
    expect(none.json().items).toEqual([]);
  });

  it('searches title and description, ignoring case, including Mongolian letters', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const byTitle = await makeEpisode(cat.id, { title: 'Хүннү гүрний үүсэл', description: 'a' });
    const byDescription = await makeEpisode(cat.id, {
      title: 'Бусад',
      description: 'Өвөг дээдсийн ЯРИА',
    });
    await makeEpisode(cat.id, { title: 'Огт холбоогүй', description: 'b' });
    const hidden = await makeEpisode(cat.id, { title: 'Хүннү ноорог', status: 'DRAFT' });

    const search = async (q: string) =>
      ids((await get(`/v1/episodes?q=${encodeURIComponent(q)}`, user.accessToken)).json().items);
    expect(await search('хүннү')).toEqual([byTitle.id]);
    expect(await search('ХҮННҮ')).toEqual([byTitle.id]);
    expect(await search('яриа')).toEqual([byDescription.id]);
    expect(await search('өвөг')).toEqual([byDescription.id]);
    expect(await search('zzzz')).toEqual([]);
    expect(await search('Хүннү')).not.toContain(hidden.id);
    // "%" and "_" are plain characters, not wildcards: with none in any title they match nothing.
    expect(await search('%')).toEqual([]);
    expect(await search('_')).toEqual([]);
  });

  it('treats %, _ and \\ in a search as literal characters', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const percent = await makeEpisode(cat.id, { title: '100% үнэн', description: 'a' });
    const underscore = await makeEpisode(cat.id, { title: 'эхний_хэсэг', description: 'b' });
    const backslash = await makeEpisode(cat.id, { title: 'зам\\дагуу', description: 'c' });
    const plain = await makeEpisode(cat.id, { title: 'энгийн гарчиг', description: 'd' });

    const search = async (q: string) =>
      ids((await get(`/v1/episodes?q=${encodeURIComponent(q)}`, user.accessToken)).json().items);
    expect(await search('%')).toEqual([percent.id]);
    expect(await search('0% ү')).toEqual([percent.id]);
    expect(await search('_')).toEqual([underscore.id]);
    expect(await search('й_х')).toEqual([underscore.id]);
    expect(await search('э_х')).toEqual([]); // "_" must not stand for one letter
    expect(await search('\\')).toEqual([backslash.id]);
    expect(await search('%%')).toEqual([]);
    expect(await search('энгийн')).toEqual([plain.id]);
  });

  it('pages with a cursor: every episode exactly once, in each sort order', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const created = [];
    for (let i = 0; i < 7; i++) {
      created.push(
        await makeEpisode(cat.id, {
          publishedAt: new Date(now.getTime() - (i + 1) * HOUR),
          durationSec: 600 + (i % 3) * 60, // ties on purpose
        }),
      );
    }

    for (const sort of ['newest', 'oldest', 'longest']) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const url: string = `/v1/episodes?sort=${sort}&limit=3${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await get(url, user.accessToken);
        expect(res.statusCode).toBe(200);
        const body: { items: Array<{ id: string }>; nextCursor: string | null } = res.json();
        expect(body.items.length).toBeLessThanOrEqual(3);
        seen.push(...ids(body.items));
        cursor = body.nextCursor;
        pages++;
      } while (cursor && pages < 10);
      expect(pages, sort).toBe(3);
      expect(new Set(seen).size, sort).toBe(7);
      expect(seen.sort(), sort).toEqual(ids(created).sort());
    }
  });

  it('rejects bad query values and cursors with VALIDATION_ERROR', async () => {
    const user = await memberOn(app);
    for (const qs of ['limit=0', 'limit=51', 'limit=abc', 'sort=random', 'cursor=garbage', 'q=']) {
      const res = await get(`/v1/episodes?${qs}`, user.accessToken);
      expect(res.statusCode, qs).toBe(400);
      expect(res.json().error.code, qs).toBe('VALIDATION_ERROR');
    }
  });

  it("reports this user's progress and saved flag, and nobody else's", async () => {
    const bat = await memberOn(app, { email: 'bat@example.com' });
    const other = await memberOn(app, { email: 'sara@example.com' });
    const cat = await makeCategory();
    const ep = await makeEpisode(cat.id);
    await testDb.playbackProgress.create({
      data: { userId: bat.userId, episodeId: ep.id, positionSec: 321, completed: false },
    });
    await testDb.savedEpisode.create({ data: { userId: bat.userId, episodeId: ep.id } });

    const mine = (await get('/v1/episodes', bat.accessToken)).json().items[0];
    const theirs = (await get('/v1/episodes', other.accessToken)).json().items[0];
    expect(mine).toMatchObject({ progress: { positionSec: 321, completed: false }, saved: true });
    expect(theirs).toMatchObject({ progress: null, saved: false });
  });
});

describe('scheduled episodes', () => {
  it('stay hidden until due and appear once the publish time has passed', async () => {
    await app.close();
    const due = new Date(Date.now() + 2 * HOUR);
    const cat = await makeCategory();

    // Before: SCHEDULED, then (after the cron publishes it) PUBLISHED, but the clock is still early.
    const before = await catalogApp({ now: new Date(due.getTime() - MIN) });
    app = before.app;
    const user = await memberOn(app);
    const ep = await makeEpisode(cat.id, { status: 'SCHEDULED', scheduledFor: due });
    expect(ids((await get('/v1/episodes', user.accessToken)).json().items)).toEqual([]);
    expect((await get(`/v1/episodes/${ep.id}`, user.accessToken)).statusCode).toBe(404);

    // Published by the cron at the due time: visible from then on.
    await testDb.episode.update({
      where: { id: ep.id },
      data: { status: 'PUBLISHED', publishedAt: due },
    });
    expect(ids((await get('/v1/episodes', user.accessToken)).json().items)).toEqual([]); // clock before due
    await app.close();

    const after = await catalogApp({ now: new Date(due.getTime() + MIN) });
    app = after.app;
    expect(ids((await get('/v1/episodes', user.accessToken)).json().items)).toEqual([ep.id]);
    expect((await get(`/v1/episodes/${ep.id}`, user.accessToken)).statusCode).toBe(200);
  });
});

describe('episode detail', () => {
  it('returns the description and the next episodes of the same category', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const other = await makeCategory();
    const mk = (days: number, over = {}) =>
      makeEpisode(cat.id, { publishedAt: new Date(now.getTime() - days * DAY), ...over });
    const e1 = await mk(7, { description: 'Эхний тайлбар' });
    const e2 = await mk(6);
    const e3 = await mk(5);
    await makeEpisode(other.id, { publishedAt: new Date(now.getTime() - 4 * DAY) }); // other category
    await mk(3, { status: 'DRAFT' });
    const e4 = await mk(2);

    const res = await get(`/v1/episodes/${e1.id}`, user.accessToken);
    expect(res.statusCode).toBe(200);
    const { episode } = res.json();
    expect(episode).toMatchObject({
      id: e1.id,
      description: 'Эхний тайлбар',
      category: { id: cat.id },
    });
    expect(ids(episode.next)).toEqual([e2.id, e3.id, e4.id]);

    const last = (await get(`/v1/episodes/${e4.id}`, user.accessToken)).json().episode;
    expect(last.next).toEqual([]);
  });

  it('is 404 for unknown, draft, scheduled and archived episodes', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const hidden = [
      await makeEpisode(cat.id, { status: 'DRAFT' }),
      await makeEpisode(cat.id, {
        status: 'SCHEDULED',
        scheduledFor: new Date(now.getTime() + DAY),
      }),
      await makeEpisode(cat.id, { status: 'ARCHIVED', publishedAt: new Date(now.getTime() - DAY) }),
    ];
    for (const id of [...ids(hidden), 'does-not-exist']) {
      const res = await get(`/v1/episodes/${id}`, user.accessToken);
      expect(res.statusCode, id).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('home', () => {
  it('has continue listening, latest, categories and this week', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const other = await makeCategory();
    const ago = (d: number) => new Date(now.getTime() - d * DAY);

    const lastWeek = await makeEpisode(cat.id, { publishedAt: ago(10) });
    const midWeek = await makeEpisode(cat.id, { publishedAt: ago(4) });
    const today = await makeEpisode(other.id, { publishedAt: new Date(now.getTime() - HOUR) });
    await makeEpisode(cat.id, { status: 'DRAFT' });
    const finished = await makeEpisode(cat.id, { publishedAt: ago(20) });

    const progress = (episodeId: string, positionSec: number, completed: boolean, ageMin: number) =>
      testDb.playbackProgress.create({
        data: {
          userId: user.userId,
          episodeId,
          positionSec,
          completed,
          updatedAt: new Date(now.getTime() - ageMin * MIN),
        },
      });
    await progress(lastWeek.id, 100, false, 30);
    await progress(midWeek.id, 50, false, 5); // more recent: comes first
    await progress(finished.id, 1700, true, 1); // completed: not in "continue"
    await progress(today.id, 0, false, 2); // never really started: not in "continue"

    const res = await get('/v1/home', user.accessToken);
    expect(res.statusCode).toBe(200);
    const home = res.json();
    expect(ids(home.continueListening)).toEqual([midWeek.id, lastWeek.id]);
    expect(home.continueListening[0].progress).toEqual({ positionSec: 50, completed: false });
    expect(ids(home.latest)).toEqual([today.id, midWeek.id, lastWeek.id, finished.id]);
    expect(ids(home.thisWeek)).toEqual([today.id, midWeek.id]);
    expect(home.categories.map((c: { episodeCount: number }) => c.episodeCount).sort()).toEqual([
      1, 3,
    ]);
  });

  it('is empty, not an error, for a new user with an empty library', async () => {
    const user = await memberOn(app);
    const res = await get('/v1/home', user.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ continueListening: [], latest: [], categories: [], thisWeek: [] });
  });

  it('limits latest to 10', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    for (let i = 0; i < 12; i++) await makeEpisode(cat.id);
    const home = (await get('/v1/home', user.accessToken)).json();
    expect(home.latest).toHaveLength(10);
    expect(home.thisWeek).toHaveLength(10);
  });
});

describe('without Bunny configured', () => {
  it('lists episodes with null covers instead of failing', async () => {
    await app.close();
    ({ app } = await catalogApp({
      env: {
        BUNNY_PULL_ZONE_HOST: '',
        BUNNY_CDN_TOKEN_KEY: '',
        BUNNY_STORAGE_ZONE: '',
        BUNNY_STORAGE_API_KEY: '',
      },
    }));
    const user = await memberOn(app);
    const cat = await makeCategory();
    await makeEpisode(cat.id);
    const item = (await get('/v1/episodes', user.accessToken)).json().items[0];
    expect(item.coverUrl).toBeNull();
    expect(item.thumbUrl).toBeNull();
  });
});
