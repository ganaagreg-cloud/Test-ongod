import { randomUUID } from 'node:crypto';
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

/** The video library's signer (ADR-0038), to recompute expected HLS URLs. */
export const testStreamSigner = createBunnySigner({
  host: BUNNY_TEST.BUNNY_STREAM_CDN_HOSTNAME,
  tokenKey: BUNNY_TEST.BUNNY_STREAM_TOKEN_KEY,
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

export const makeSeries = (over: { title?: string; slug?: string; description?: string } = {}) => {
  seq++;
  return testDb.series.create({
    data: {
      title: over.title ?? `Series ${seq}`,
      slug: over.slug ?? `series-${seq}`,
      description: over.description ?? '',
    },
  });
};

export const makePlaylist = (
  over: {
    title?: string;
    slug?: string;
    description?: string;
    showOnHome?: boolean;
    homeOrder?: number;
    isFeatured?: boolean;
  } = {},
) => {
  seq++;
  return testDb.playlist.create({
    data: {
      title: over.title ?? `Playlist ${seq}`,
      slug: over.slug ?? `playlist-${seq}`,
      description: over.description ?? '',
      showOnHome: over.showOnHome ?? false,
      homeOrder: over.homeOrder ?? 0,
      isFeatured: over.isFeatured ?? false,
    },
  });
};

export const makeTag = (over: { name?: string; slug?: string } = {}) => {
  seq++;
  return testDb.tag.create({
    data: { name: over.name ?? `Tag ${seq}`, slug: over.slug ?? `tag-${seq}` },
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
    /** AUDIO (default) on Bunny Storage, or VIDEO on Bunny Stream with a random video id. */
    kind?: 'AUDIO' | 'VIDEO';
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
    const video = over.kind === 'VIDEO';
    await testDb.mediaAsset.create({
      data: {
        episodeId: episode.id,
        kind: video ? 'VIDEO' : 'AUDIO',
        provider: video ? 'BUNNY_STREAM' : 'BUNNY_STORAGE',
        path: video ? randomUUID() : `audio/${episode.id}/audio.mp3`,
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
