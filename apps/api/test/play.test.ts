import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { device, loginOn, login, PASSWORD, signedIn } from './auth-helpers';
import {
  DAY,
  HOUR,
  MIN,
  authed,
  catalogApp,
  makeCategory,
  makeEpisode,
  memberOn,
  setAccess,
  testSigner,
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

const play = (episodeId: string, token: string) =>
  authed(app, 'POST', `/v1/episodes/${episodeId}/play`, token);

async function readyEpisode() {
  const cat = await makeCategory();
  const episode = await makeEpisode(cat.id);
  const asset = await testDb.mediaAsset.findFirstOrThrow({ where: { episodeId: episode.id } });
  return { episode, asset };
}

describe('POST /v1/episodes/:id/play: access rules', () => {
  it('refuses a user with no access: 403 NO_ACCESS, and says nothing about price or payment', async () => {
    const user = await memberOn(app, { accessUntil: null });
    const { episode } = await readyEpisode();

    const res = await play(episode.id, user.accessToken);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: { code: 'NO_ACCESS', message: 'Таны эрх идэвхгүй байна.' },
    });
    expect(res.body).not.toMatch(/url|token|price|₮|төлб|үнэ|plan/i);
  });

  it('refuses expired access: 403 NO_ACCESS', async () => {
    const user = await memberOn(app, { accessUntil: new Date(now.getTime() - MIN) });
    const { episode } = await readyEpisode();
    const res = await play(episode.id, user.accessToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NO_ACCESS');
  });

  it('refuses access that ends exactly now', async () => {
    const user = await memberOn(app, { accessUntil: new Date(now.getTime()) });
    const { episode } = await readyEpisode();
    expect((await play(episode.id, user.accessToken)).statusCode).toBe(403);
  });

  it('refuses the same user once access is revoked after a successful play', async () => {
    const user = await memberOn(app);
    const { episode } = await readyEpisode();
    expect((await play(episode.id, user.accessToken)).statusCode).toBe(200);
    await setAccess(user.userId, null);
    const res = await play(episode.id, user.accessToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NO_ACCESS');
  });

  it('refuses a session whose device is no longer registered: 403 DEVICE_NOT_REGISTERED', async () => {
    const user = await memberOn(app);
    const { episode } = await readyEpisode();
    await testDb.device.deleteMany({ where: { userId: user.userId } });
    const res = await play(episode.id, user.accessToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('DEVICE_NOT_REGISTERED');
  });

  it('a 3rd device is refused at login, so it never gets a token that could play', async () => {
    const first = await memberOn(app, { email: 'bat@example.com' });
    await loginOn(app, 'bat@example.com', device(2));
    const { episode } = await readyEpisode();

    const third = await login(app, 'bat@example.com', device(3));
    expect(third.statusCode).toBe(403);
    expect(third.json().error.code).toBe('DEVICE_LIMIT');
    expect(third.json()).not.toHaveProperty('accessToken');
    expect(third.json().error.details.devices).toHaveLength(2);

    // The two registered devices still play.
    expect((await play(episode.id, first.accessToken)).statusCode).toBe(200);
    const second = await loginOn(app, 'bat@example.com', device(2));
    expect((await play(episode.id, second.accessToken)).statusCode).toBe(200);
  });

  it('a device removed by the user stops playing at once (not after the token expires)', async () => {
    const first = await memberOn(app, { email: 'bat@example.com' });
    const second = await loginOn(app, 'bat@example.com', device(2));
    const { episode } = await readyEpisode();
    expect((await play(episode.id, second.accessToken)).statusCode).toBe(200);

    const devices = (await authed(app, 'GET', '/v1/me/devices', first.accessToken)).json().devices;
    const doomed = devices.find((d: { current: boolean }) => !d.current);
    const removed = await authed(app, 'DELETE', `/v1/me/devices/${doomed.id}`, first.accessToken, {
      password: PASSWORD,
    });
    expect(removed.statusCode).toBe(204);

    expect((await play(episode.id, second.accessToken)).statusCode).toBe(401);
    expect((await play(episode.id, first.accessToken)).statusCode).toBe(200);
  });

  it("does not let one user play on another user's access", async () => {
    const paying = await memberOn(app, { email: 'bat@example.com' });
    const free = await signedIn(app, { email: 'sara@example.com', device: device(7) });
    const { episode } = await readyEpisode();
    expect((await play(episode.id, paying.accessToken)).statusCode).toBe(200);
    expect((await play(episode.id, free.accessToken)).statusCode).toBe(403);
  });
});

describe('POST /v1/episodes/:id/play: the signed URL', () => {
  it('returns a Bunny token URL for the READY audio, valid 4 hours, never cached', async () => {
    const user = await memberOn(app);
    const { episode, asset } = await readyEpisode();

    const res = await play(episode.id, user.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');

    const body = res.json();
    const expiresAt = new Date(now.getTime() + 4 * HOUR);
    expect(body.expiresAt).toBe(expiresAt.toISOString());
    expect(body.durationSec).toBe(1800);

    // Exactly what the signer (checked against Bunny's reference code) produces for this path.
    expect(body.url).toBe(testSigner.signUrl({ path: `/${asset.path}`, expiresAt }));
    const url = new URL(body.url);
    expect(url.protocol + '//' + url.host).toBe('https://test-zone.b-cdn.net');
    expect(url.pathname).toBe(`/${asset.path}`);
    expect(url.searchParams.get('token')).toMatch(/^HS256-[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('expires')).toBe(String(Math.floor(expiresAt.getTime() / 1000)));
    expect([...url.searchParams.keys()].sort()).toEqual(['expires', 'token']); // no IP, nothing else
  });

  it('never outlives the access: expiry is capped at the end of access', async () => {
    const accessUntil = new Date(now.getTime() + 30 * MIN);
    const user = await memberOn(app, { accessUntil });
    const { episode, asset } = await readyEpisode();

    const body = (await play(episode.id, user.accessToken)).json();
    expect(body.expiresAt).toBe(accessUntil.toISOString());
    expect(body.url).toBe(testSigner.signUrl({ path: `/${asset.path}`, expiresAt: accessUntil }));
  });

  it('uses the full 4 hours when access lasts longer', async () => {
    const user = await memberOn(app, { accessUntil: new Date(now.getTime() + 400 * DAY) });
    const { episode } = await readyEpisode();
    const body = (await play(episode.id, user.accessToken)).json();
    expect(new Date(body.expiresAt).getTime() - now.getTime()).toBe(4 * HOUR);
  });

  it('gives a different link for a different episode', async () => {
    const user = await memberOn(app);
    const a = await readyEpisode();
    const b = await readyEpisode();
    const urlA = (await play(a.episode.id, user.accessToken)).json().url;
    const urlB = (await play(b.episode.id, user.accessToken)).json().url;
    expect(urlA).not.toBe(urlB);
    expect(new URL(urlA).pathname).not.toBe(new URL(urlB).pathname);
  });

  it('records the device as seen', async () => {
    const user = await memberOn(app);
    const { episode } = await readyEpisode();
    await testDb.device.updateMany({
      where: { userId: user.userId },
      data: { lastSeenAt: new Date(now.getTime() - 5 * DAY) },
    });
    await play(episode.id, user.accessToken);
    const seen = await testDb.device.findFirstOrThrow({ where: { userId: user.userId } });
    expect(seen.lastSeenAt.getTime()).toBe(now.getTime());
  });
});

describe('POST /v1/episodes/:id/play: episode state', () => {
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
      await makeEpisode(cat.id, { publishedAt: new Date(now.getTime() + HOUR) }), // PUBLISHED but not due
    ];
    for (const id of [...hidden.map((e) => e.id), 'does-not-exist']) {
      const res = await play(id, user.accessToken);
      expect(res.statusCode, id).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });

  it.each(['PROCESSING', 'UPLOADING', 'FAILED', 'NONE'] as const)(
    'is 409 MEDIA_NOT_READY when the audio is %s',
    async (media) => {
      const user = await memberOn(app);
      const cat = await makeCategory();
      const episode = await makeEpisode(cat.id, { media });
      const res = await play(episode.id, user.accessToken);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('MEDIA_NOT_READY');
    },
  );

  it('plays the READY file, not a failed one, when an episode has both', async () => {
    const user = await memberOn(app);
    const cat = await makeCategory();
    const episode = await makeEpisode(cat.id, { media: 'FAILED' });
    const ready = await testDb.mediaAsset.create({
      data: {
        episodeId: episode.id,
        kind: 'AUDIO',
        provider: 'BUNNY_STORAGE',
        path: `audio/${episode.id}/retry.mp3`,
        status: 'READY',
        durationSec: 900,
      },
    });
    const body = (await play(episode.id, user.accessToken)).json();
    expect(new URL(body.url).pathname).toBe(`/${ready.path}`);
  });

  it('is 503 (not a crash, no URL) when Bunny is not configured', async () => {
    await app.close();
    ({ app, now } = await catalogApp({
      env: {
        BUNNY_PULL_ZONE_HOST: '',
        BUNNY_CDN_TOKEN_KEY: '',
        BUNNY_STORAGE_ZONE: '',
        BUNNY_STORAGE_API_KEY: '',
      },
    }));
    const user = await memberOn(app);
    const { episode } = await readyEpisode();
    const res = await play(episode.id, user.accessToken);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('is 500 with a generic error, never a URL, if a stored path cannot be signed', async () => {
    const user = await memberOn(app);
    const { episode, asset } = await readyEpisode();
    await testDb.mediaAsset.update({ where: { id: asset.id }, data: { path: 'audio/онгод.mp3' } });
    const res = await play(episode.id, user.accessToken);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL');
    expect(res.body).not.toContain('b-cdn.net');
  });
});
