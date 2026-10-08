import type { FastifyInstance } from 'fastify';
import { createBunnySigner } from '../src/lib/bunnyToken';
import { BUNNY_TEST, testApp, testDb, testEnv } from './helpers';
import { device, signedIn, type Signed } from './auth-helpers';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Same key as the app under test, to recompute the expected token. */
export const testSigner = createBunnySigner({
  host: BUNNY_TEST.BUNNY_PULL_ZONE_HOST,
  tokenKey: BUNNY_TEST.BUNNY_CDN_TOKEN_KEY,
});

/**
 * An app whose catalog clock is frozen at `now` (default: the moment of the call), so expiry
 * times and "published yet?" decisions are exact.
 */
export function catalogApp(opts: { now?: Date; env?: Parameters<typeof testEnv>[0] } = {}) {
  const now = opts.now ?? new Date();
  return testApp({ env: testEnv(opts.env), now: () => now }).then((app) => ({ app, now }));
}

let seq = 0;

export const makeCategory = (over: { name?: string; slug?: string; sortOrder?: number } = {}) => {
  seq++;
  return testDb.category.create({
    data: {
      name: over.name ?? `Category ${seq}`,
      slug: over.slug ?? `category-${seq}`,
      sortOrder: over.sortOrder ?? seq,
    },
  });
};

type MediaState = 'READY' | 'PROCESSING' | 'UPLOADING' | 'FAILED' | 'NONE';

export async function makeEpisode(
  categoryId: string,
  over: {
    title?: string;
    description?: string;
    status?: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
    publishedAt?: Date | null;
    scheduledFor?: Date | null;
    durationSec?: number;
    media?: MediaState;
    coverPath?: string;
  } = {},
) {
  seq++;
  const status = over.status ?? 'PUBLISHED';
  const episode = await testDb.episode.create({
    data: {
      categoryId,
      title: over.title ?? `Episode ${seq}`,
      description: over.description ?? `Description ${seq}`,
      coverPath: over.coverPath ?? `covers/ep${seq}/cover.webp`,
      status,
      scheduledFor: over.scheduledFor ?? null,
      publishedAt:
        over.publishedAt !== undefined
          ? over.publishedAt
          : status === 'PUBLISHED'
            ? new Date(Date.now() - seq * MIN)
            : null,
    },
  });
  const media = over.media ?? 'READY';
  if (media !== 'NONE') {
    await testDb.mediaAsset.create({
      data: {
        episodeId: episode.id,
        kind: 'AUDIO',
        provider: 'BUNNY_STORAGE',
        path: `audio/${episode.id}/audio.mp3`,
        status: media,
        durationSec: media === 'READY' ? (over.durationSec ?? 1800) : null,
        failReason: media === 'FAILED' ? 'test failure' : null,
      },
    });
  }
  return episode;
}

/** Gives a user paid access until `until` (null removes it). */
export const setAccess = (userId: string, until: Date | null) =>
  testDb.user.update({ where: { id: userId }, data: { accessUntil: until } });

export const authed = (
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  token: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    payload: payload as object,
    headers: { authorization: `Bearer ${token}` },
  });

/** A registered, logged-in user on device 1 with access for 30 days. */
export async function memberOn(
  app: FastifyInstance,
  opts: { email?: string; accessUntil?: Date | null } = {},
): Promise<Signed> {
  const user = await signedIn(app, { email: opts.email ?? 'bat@example.com', device: device(1) });
  const until = opts.accessUntil === undefined ? new Date(Date.now() + 30 * DAY) : opts.accessUntil;
  await setAccess(user.userId, until);
  return user;
}

export const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);
