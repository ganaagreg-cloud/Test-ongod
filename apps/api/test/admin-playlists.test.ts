import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authApp } from './auth-helpers';
import { call, makeAdmin, makeMember, multipart } from './admin-helpers';
import { makeCategory, makeEpisode, makePlaylist } from './catalog-helpers';
import { listeningApp, pngImage, runMediaJobs } from './content-helpers';
import { testDb } from './helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

const PLAYLIST_ROUTES: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string, unknown?]> = [
  ['GET', '/v1/admin/playlists'],
  ['POST', '/v1/admin/playlists', { title: 'Жагсаалт', slug: 'jagsaalt' }],
  ['POST', '/v1/admin/playlists/home-order', { playlistIds: ['a'] }],
  ['GET', '/v1/admin/playlists/x'],
  ['PATCH', '/v1/admin/playlists/x', { title: 'Шинэ' }],
  ['DELETE', '/v1/admin/playlists/x'],
  ['POST', '/v1/admin/playlists/x/items', { episodeIds: ['a'] }],
  ['DELETE', '/v1/admin/playlists/x/items/y'],
  ['POST', '/v1/admin/playlists/x/reorder', { episodeIds: ['a'] }],
  ['POST', '/v1/admin/playlists/x/cover'],
];

async function episodes(n: number) {
  const category = await makeCategory();
  const out = [];
  for (let i = 0; i < n; i++) out.push(await makeEpisode(category.id));
  return out;
}

const positions = async (playlistId: string) =>
  Object.fromEntries(
    (await testDb.playlistItem.findMany({ where: { playlistId } })).map((i) => [
      i.episodeId,
      i.position,
    ]),
  );

describe('playlist access', () => {
  it('every playlist route needs an admin', async () => {
    for (const [method, url, body] of PLAYLIST_ROUTES) {
      const res = await call(app, method, url, undefined, body);
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    const member = await makeMember(app);
    for (const [method, url, body] of PLAYLIST_ROUTES) {
      const res = await call(app, method, url, member.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('an admin can create, list, read, update a playlist', async () => {
    const admin = await makeAdmin(app);
    const created = await call(app, 'POST', '/v1/admin/playlists', admin.accessToken, {
      title: 'Эхний',
      slug: 'ekhnii',
    });
    expect(created.statusCode).toBe(201);
    const { playlist } = created.json();
    expect(playlist).toMatchObject({
      title: 'Эхний',
      slug: 'ekhnii',
      description: '',
      coverUrl: null,
      showOnHome: false,
      homeOrder: 0,
      isFeatured: false,
      episodeCount: 0,
      episodes: [],
    });
    const dup = await call(app, 'POST', '/v1/admin/playlists', admin.accessToken, {
      title: 'Өөр',
      slug: 'ekhnii',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('PLAYLIST_SLUG_TAKEN');

    const url = `/v1/admin/playlists/${playlist.id}`;
    const patched = await call(app, 'PATCH', url, admin.accessToken, {
      description: 'Тайлбар',
      showOnHome: true,
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().playlist).toMatchObject({ description: 'Тайлбар', showOnHome: true });
    expect((await call(app, 'PATCH', url, admin.accessToken, {})).statusCode).toBe(400);
    expect((await call(app, 'GET', '/v1/admin/playlists/nope', admin.accessToken)).statusCode).toBe(
      404,
    );
    expect(await testDb.auditLog.count({ where: { action: 'playlist.create' } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: 'playlist.update' } })).toBe(1);
  });
});

describe('Онцлох', () => {
  it('list always includes Онцлох first', async () => {
    const admin = await makeAdmin(app);
    const res = await call(app, 'GET', '/v1/admin/playlists', admin.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().playlists).toHaveLength(1);
    expect(res.json().playlists[0]).toMatchObject({
      id: 'featured',
      isFeatured: true,
      title: 'Онцлох',
    });
    await makePlaylist({ title: 'Бусад' });
    const again = await call(app, 'GET', '/v1/admin/playlists', admin.accessToken);
    expect(again.json().playlists.map((p: { id: string }) => p.id)[0]).toBe('featured');
    expect(again.json().playlists).toHaveLength(2);
    const one = await call(app, 'GET', '/v1/admin/playlists/featured', admin.accessToken);
    expect(one.json().playlist.isFeatured).toBe(true);
  });

  it('featured cannot be deleted, renamed or re-slugged (409 PLAYLIST_FEATURED)', async () => {
    const admin = await makeAdmin(app);
    const del = await call(app, 'DELETE', '/v1/admin/playlists/featured', admin.accessToken);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('PLAYLIST_FEATURED');
    const title = await call(app, 'PATCH', '/v1/admin/playlists/featured', admin.accessToken, {
      title: 'Өөр',
    });
    expect(title.statusCode).toBe(409);
    expect(title.json().error.code).toBe('PLAYLIST_FEATURED');
    const ok = await call(app, 'PATCH', '/v1/admin/playlists/featured', admin.accessToken, {
      description: 'Сонгосон',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().playlist.title).toBe('Онцлох');
    expect(await testDb.playlist.count({ where: { id: 'featured' } })).toBe(1);
  });
});

describe('reserved slug', () => {
  it('the slug featured is taken, and Онцлох still appears', async () => {
    const admin = await makeAdmin(app);
    const res = await call(app, 'POST', '/v1/admin/playlists', admin.accessToken, {
      title: 'Хуурамч',
      slug: 'featured',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PLAYLIST_SLUG_TAKEN');
    const other = await makePlaylist();
    const upd = await call(app, 'PATCH', `/v1/admin/playlists/${other.id}`, admin.accessToken, {
      slug: 'featured',
    });
    expect(upd.statusCode).toBe(409);
    expect(upd.json().error.code).toBe('PLAYLIST_SLUG_TAKEN');
    const list = await call(app, 'GET', '/v1/admin/playlists', admin.accessToken);
    expect(list.json().playlists[0]).toMatchObject({ id: 'featured', title: 'Онцлох' });
  });
});

describe('playlist items', () => {
  it('addItems appends in the given order, skips ones already in', async () => {
    const admin = await makeAdmin(app);
    const list = await makePlaylist();
    const [a, b, c] = await episodes(3);
    const url = `/v1/admin/playlists/${list.id}/items`;
    const first = await call(app, 'POST', url, admin.accessToken, { episodeIds: [a!.id, b!.id] });
    expect(first.statusCode).toBe(200);
    const second = await call(app, 'POST', url, admin.accessToken, { episodeIds: [b!.id, c!.id] });
    expect(second.statusCode).toBe(200);
    expect(await positions(list.id)).toEqual({ [a!.id]: 1, [b!.id]: 2, [c!.id]: 3 });
    expect(second.json().playlist.episodeCount).toBe(3);
    expect(second.json().playlist.episodes.map((e: { id: string }) => e.id)).toEqual([
      a!.id,
      b!.id,
      c!.id,
    ]);
    // Only the one new item is audited.
    expect(await testDb.auditLog.count({ where: { action: 'playlist.add-item' } })).toBe(3);
  });

  it('an unknown episode is 404 and adds nothing', async () => {
    const admin = await makeAdmin(app);
    const list = await makePlaylist();
    const [a] = await episodes(1);
    const res = await call(app, 'POST', `/v1/admin/playlists/${list.id}/items`, admin.accessToken, {
      episodeIds: [a!.id, 'nope'],
    });
    expect(res.statusCode).toBe(404);
    expect(await testDb.playlistItem.count()).toBe(0);
    const empty = await call(
      app,
      'POST',
      `/v1/admin/playlists/${list.id}/items`,
      admin.accessToken,
      { episodeIds: [] },
    );
    expect(empty.statusCode).toBe(400);
  });

  it('removeItem closes the gap; removing a missing item is 404', async () => {
    const admin = await makeAdmin(app);
    const list = await makePlaylist();
    const [a, b, c] = await episodes(3);
    await call(app, 'POST', `/v1/admin/playlists/${list.id}/items`, admin.accessToken, {
      episodeIds: [a!.id, b!.id, c!.id],
    });
    const del = await call(
      app,
      'DELETE',
      `/v1/admin/playlists/${list.id}/items/${a!.id}`,
      admin.accessToken,
    );
    expect(del.statusCode).toBe(200);
    expect(await positions(list.id)).toEqual({ [b!.id]: 1, [c!.id]: 2 });
    const again = await call(
      app,
      'DELETE',
      `/v1/admin/playlists/${list.id}/items/${a!.id}`,
      admin.accessToken,
    );
    expect(again.statusCode).toBe(404);
  });

  it('reorder needs exactly the playlist items', async () => {
    const admin = await makeAdmin(app);
    const list = await makePlaylist();
    const [a, b, c] = await episodes(3);
    await call(app, 'POST', `/v1/admin/playlists/${list.id}/items`, admin.accessToken, {
      episodeIds: [a!.id, b!.id, c!.id],
    });
    const url = `/v1/admin/playlists/${list.id}/reorder`;
    const ok = await call(app, 'POST', url, admin.accessToken, {
      episodeIds: [c!.id, a!.id, b!.id],
    });
    expect(ok.statusCode).toBe(200);
    expect(await positions(list.id)).toEqual({ [c!.id]: 1, [a!.id]: 2, [b!.id]: 3 });
    const missing = await call(app, 'POST', url, admin.accessToken, {
      episodeIds: [a!.id, b!.id],
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('VALIDATION_ERROR');
    const [other] = await episodes(1);
    const extra = await call(app, 'POST', url, admin.accessToken, {
      episodeIds: [a!.id, b!.id, c!.id, other!.id],
    });
    expect(extra.statusCode).toBe(400);
    const dupes = await call(app, 'POST', url, admin.accessToken, {
      episodeIds: [a!.id, a!.id, b!.id],
    });
    expect(dupes.statusCode).toBe(400);
    expect(await positions(list.id)).toEqual({ [c!.id]: 1, [a!.id]: 2, [b!.id]: 3 });
  });

  it('delete playlist keeps items', async () => {
    const admin = await makeAdmin(app);
    const list = await makePlaylist();
    const [a] = await episodes(1);
    await call(app, 'POST', `/v1/admin/playlists/${list.id}/items`, admin.accessToken, {
      episodeIds: [a!.id],
    });
    const res = await call(app, 'DELETE', `/v1/admin/playlists/${list.id}`, admin.accessToken);
    expect(res.statusCode).toBe(204);
    expect(await testDb.episode.count({ where: { id: a!.id } })).toBe(1);
    expect(await testDb.playlistItem.count()).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: 'playlist.delete' } })).toBe(1);
    expect(
      (await call(app, 'DELETE', `/v1/admin/playlists/${list.id}`, admin.accessToken)).statusCode,
    ).toBe(404);
  });

  it('simultaneous adds never give a 500 or a repeated position', async () => {
    const admin = await makeAdmin(app);
    const list = await makePlaylist();
    const eps = await episodes(4);
    const results = await Promise.all(
      eps.map((e) =>
        call(app, 'POST', `/v1/admin/playlists/${list.id}/items`, admin.accessToken, {
          episodeIds: [e.id],
        }),
      ),
    );
    for (const r of results) expect([200, 409]).toContain(r.statusCode);
    const pos = Object.values(await positions(list.id)).sort();
    expect(new Set(pos).size).toBe(pos.length);
    // The lock serialises them: every add lands, at 1..n.
    expect(pos).toEqual([1, 2, 3, 4]);
  });
});

describe('home order', () => {
  it('sets homeOrder 1..n for the given ids; featured is rejected', async () => {
    const admin = await makeAdmin(app);
    const a = await makePlaylist({ showOnHome: true });
    const b = await makePlaylist({ showOnHome: true });
    const c = await makePlaylist({ showOnHome: true });
    const url = '/v1/admin/playlists/home-order';
    const res = await call(app, 'POST', url, admin.accessToken, {
      playlistIds: [c.id, a.id, b.id],
    });
    expect(res.statusCode).toBe(200);
    const order = async (id: string) =>
      (await testDb.playlist.findUniqueOrThrow({ where: { id } })).homeOrder;
    expect([await order(c.id), await order(a.id), await order(b.id)]).toEqual([1, 2, 3]);

    const withFeatured = await call(app, 'POST', url, admin.accessToken, {
      playlistIds: ['featured', a.id],
    });
    expect(withFeatured.statusCode).toBe(400);
    expect(withFeatured.json().error.code).toBe('VALIDATION_ERROR');
    const unknown = await call(app, 'POST', url, admin.accessToken, {
      playlistIds: [a.id, 'nope'],
    });
    expect(unknown.statusCode).toBe(404);
    expect(await order(c.id)).toBe(1);
  });
});

describe('playlist cover', () => {
  it('stores a 16:9 cover through a job', async () => {
    await app.close();
    const live = await listeningApp();
    app = live.app;
    const admin = await makeAdmin(app);
    const list = await makePlaylist();
    const { payload, headers } = await multipart(
      {},
      { name: 'c.png', data: await pngImage(1200, 700), type: 'image/png', field: 'cover' },
    );
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/playlists/${list.id}/cover`,
      payload,
      headers: { ...headers, authorization: `Bearer ${admin.accessToken}` },
    });
    expect(res.statusCode).toBe(202);
    await runMediaJobs(live.runtime);
    const stored = await testDb.playlist.findUniqueOrThrow({ where: { id: list.id } });
    expect(stored.coverPath).toMatch(
      new RegExp(`^covers/playlists/${list.id}/[0-9a-f-]{36}\\.webp$`),
    );
    const meta = await sharp(join(live.runtime.dirs.published, stored.coverPath!)).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1280, height: 720 });
    const got = await call(app, 'GET', `/v1/admin/playlists/${list.id}`, admin.accessToken);
    expect(got.json().playlist.coverUrl).toEqual(expect.any(String));
    const bad = await call(app, 'POST', `/v1/admin/playlists/${list.id}/cover`, admin.accessToken);
    expect(bad.statusCode).toBe(400);
  });
});
