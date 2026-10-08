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

const send = (method: 'GET' | 'PUT' | 'DELETE', url: string, token: string, body?: unknown) =>
  authed(app, method, url, token, body);

async function oneEpisode() {
  const cat = await makeCategory();
  return makeEpisode(cat.id);
}

describe('PUT /v1/progress/:episodeId', () => {
  it('needs a signed-in user', async () => {
    const ep = await oneEpisode();
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/progress/${ep.id}`,
      payload: { positionSec: 5 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('stores the position (204), and the last write wins', async () => {
    const user = await memberOn(app);
    const ep = await oneEpisode();

    const first = await send('PUT', `/v1/progress/${ep.id}`, user.accessToken, {
      positionSec: 120,
    });
    expect(first.statusCode).toBe(204);
    expect(first.body).toBe('');
    await send('PUT', `/v1/progress/${ep.id}`, user.accessToken, { positionSec: 600 });
    await send('PUT', `/v1/progress/${ep.id}`, user.accessToken, { positionSec: 45 }); // seeked back

    const rows = await testDb.playbackProgress.findMany({ where: { userId: user.userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ episodeId: ep.id, positionSec: 45, completed: false });
  });

  it('marks completed, and un-marks it when the user starts again', async () => {
    const user = await memberOn(app);
    const ep = await oneEpisode();
    await send('PUT', `/v1/progress/${ep.id}`, user.accessToken, {
      positionSec: 1800,
      completed: true,
    });
    expect(await testDb.playbackProgress.findFirstOrThrow()).toMatchObject({ completed: true });
    await send('PUT', `/v1/progress/${ep.id}`, user.accessToken, { positionSec: 3 });
    expect(await testDb.playbackProgress.findFirstOrThrow()).toMatchObject({
      completed: false,
      positionSec: 3,
    });
  });

  it('survives many quick saves and parallel first writes (throttle-friendly)', async () => {
    const user = await memberOn(app);
    const ep = await oneEpisode();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        send('PUT', `/v1/progress/${ep.id}`, user.accessToken, { positionSec: i * 5 }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(12).fill(204));
    expect(await testDb.playbackProgress.count()).toBe(1);
  });

  it("keeps each user's progress separate", async () => {
    const bat = await memberOn(app, { email: 'bat@example.com' });
    const sara = await memberOn(app, { email: 'sara@example.com' });
    const ep = await oneEpisode();
    await send('PUT', `/v1/progress/${ep.id}`, bat.accessToken, { positionSec: 100 });
    await send('PUT', `/v1/progress/${ep.id}`, sara.accessToken, { positionSec: 900 });
    const byUser = Object.fromEntries(
      (await testDb.playbackProgress.findMany()).map((r) => [r.userId, r.positionSec]),
    );
    expect(byUser).toEqual({ [bat.userId]: 100, [sara.userId]: 900 });
  });

  it.each([
    ['negative position', { positionSec: -1 }],
    ['fractional position', { positionSec: 1.5 }],
    ['more than 24 h', { positionSec: 86_401 }],
    ['string position', { positionSec: '10' }],
    ['missing position', {}],
    ['non-boolean completed', { positionSec: 1, completed: 'yes' }],
  ])('rejects %s with VALIDATION_ERROR', async (_name, body) => {
    const user = await memberOn(app);
    const ep = await oneEpisode();
    const res = await send('PUT', `/v1/progress/${ep.id}`, user.accessToken, body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await testDb.playbackProgress.count()).toBe(0);
  });

  it('is 404 for unknown and unpublished episodes, and stores nothing', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const draft = await makeEpisode(cat.id, { status: 'DRAFT' });
    const scheduled = await makeEpisode(cat.id, {
      status: 'SCHEDULED',
      scheduledFor: new Date(now.getTime() + DAY),
    });
    for (const id of [draft.id, scheduled.id, 'nope']) {
      const res = await send('PUT', `/v1/progress/${id}`, user.accessToken, { positionSec: 5 });
      expect(res.statusCode, id).toBe(404);
    }
    expect(await testDb.playbackProgress.count()).toBe(0);
  });
});

describe('saved episodes', () => {
  it('PUT saves (204) and is idempotent: saving twice keeps one row and the first time', async () => {
    const user = await memberOn(app);
    const ep = await oneEpisode();
    expect((await send('PUT', `/v1/saved/${ep.id}`, user.accessToken)).statusCode).toBe(204);
    const first = await testDb.savedEpisode.findFirstOrThrow();
    await new Promise((r) => setTimeout(r, 15));
    expect((await send('PUT', `/v1/saved/${ep.id}`, user.accessToken)).statusCode).toBe(204);
    const rows = await testDb.savedEpisode.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.createdAt.getTime()).toBe(first.createdAt.getTime());
  });

  it('parallel first saves do not fail', async () => {
    const user = await memberOn(app);
    const ep = await oneEpisode();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => send('PUT', `/v1/saved/${ep.id}`, user.accessToken)),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(6).fill(204));
    expect(await testDb.savedEpisode.count()).toBe(1);
  });

  it('DELETE removes it, and is 204 whether or not it was saved', async () => {
    const user = await memberOn(app);
    const ep = await oneEpisode();
    await send('PUT', `/v1/saved/${ep.id}`, user.accessToken);
    expect((await send('DELETE', `/v1/saved/${ep.id}`, user.accessToken)).statusCode).toBe(204);
    expect(await testDb.savedEpisode.count()).toBe(0);
    expect((await send('DELETE', `/v1/saved/${ep.id}`, user.accessToken)).statusCode).toBe(204);
    expect((await send('DELETE', `/v1/saved/never-existed`, user.accessToken)).statusCode).toBe(
      204,
    );
  });

  it('GET lists the most recently saved first and flags them as saved', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const a = await makeEpisode(cat.id);
    const b = await makeEpisode(cat.id);
    const c = await makeEpisode(cat.id);
    const savedAt = (episodeId: string, minutesAgo: number) =>
      testDb.savedEpisode.create({
        data: {
          userId: user.userId,
          episodeId,
          createdAt: new Date(now.getTime() - minutesAgo * MIN),
        },
      });
    await savedAt(a.id, 30);
    await savedAt(c.id, 5);
    await savedAt(b.id, 10);

    const res = await send('GET', '/v1/saved', user.accessToken);
    expect(res.statusCode).toBe(200);
    expect(ids(res.json().items)).toEqual([c.id, b.id, a.id]);
    expect(res.json().items.every((i: { saved: boolean }) => i.saved)).toBe(true);
    expect(res.json().nextCursor).toBeNull();
  });

  it('GET pages with a cursor', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const made = [];
    for (let i = 0; i < 5; i++) {
      const ep = await makeEpisode(cat.id);
      await testDb.savedEpisode.create({
        data: {
          userId: user.userId,
          episodeId: ep.id,
          createdAt: new Date(now.getTime() - i * HOUR),
        },
      });
      made.push(ep.id);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/v1/saved?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const body: { items: Array<{ id: string }>; nextCursor: string | null } = (
        await send('GET', url, user.accessToken)
      ).json();
      seen.push(...ids(body.items));
      cursor = body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(made); // saved newest first = the order they were made here
  });

  it('is private to each user', async () => {
    const bat = await memberOn(app, { email: 'bat@example.com' });
    const sara = await memberOn(app, { email: 'sara@example.com' });
    const ep = await oneEpisode();
    await send('PUT', `/v1/saved/${ep.id}`, bat.accessToken);
    expect((await send('GET', '/v1/saved', sara.accessToken)).json().items).toEqual([]);
    // Sara removing it does not remove Bat's.
    await send('DELETE', `/v1/saved/${ep.id}`, sara.accessToken);
    expect(ids((await send('GET', '/v1/saved', bat.accessToken)).json().items)).toEqual([ep.id]);
  });

  it('cannot save unknown or unpublished episodes (404), and hides ones unpublished later', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const draft = await makeEpisode(cat.id, { status: 'DRAFT' });
    for (const id of [draft.id, 'nope']) {
      expect((await send('PUT', `/v1/saved/${id}`, user.accessToken)).statusCode, id).toBe(404);
    }
    expect(await testDb.savedEpisode.count()).toBe(0);

    const ep = await makeEpisode(cat.id);
    await send('PUT', `/v1/saved/${ep.id}`, user.accessToken);
    await testDb.episode.update({ where: { id: ep.id }, data: { status: 'ARCHIVED' } });
    expect((await send('GET', '/v1/saved', user.accessToken)).json().items).toEqual([]);
    // The row is still removable.
    expect((await send('DELETE', `/v1/saved/${ep.id}`, user.accessToken)).statusCode).toBe(204);
    expect(await testDb.savedEpisode.count()).toBe(0);
  });

  it('rejects a bad cursor or limit', async () => {
    const user = await memberOn(app);
    for (const qs of ['cursor=garbage', 'limit=0', 'limit=99']) {
      const res = await send('GET', `/v1/saved?${qs}`, user.accessToken);
      expect(res.statusCode, qs).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('works without paid access (saving is not playback)', async () => {
    const user = await memberOn(app, { accessUntil: null });
    const ep = await oneEpisode();
    expect((await send('PUT', `/v1/saved/${ep.id}`, user.accessToken)).statusCode).toBe(204);
    expect((await send('GET', '/v1/saved', user.accessToken)).json().items).toHaveLength(1);
  });
});
