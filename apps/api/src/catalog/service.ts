import type {
  CategoryDto,
  EpisodeDetail,
  EpisodeItem,
  EpisodesPage,
  HomeResponse,
  ListEpisodesQuery,
  PlayResponse,
  SaveProgressRequest,
} from '@ongod/shared';
import type { Db, Prisma } from '../db';
import { AppError } from '../errors';
import type { Session, User } from '../generated/prisma/client';
import { escapeLike } from '../lib/like';
import { decodeCursor, pageAfter, type Direction, type Entry } from './cursor';
import { PLAY_URL_TTL_MS, type MediaUrls } from './media';

const DAY_MS = 24 * 60 * 60_000;
const HOME_ROW = 10;
const NEXT_ROW = 5;

/** The READY audio file of an episode (SPEC G: media status Ready). */
const readyAudio = {
  where: { kind: 'AUDIO', status: 'READY' },
  select: { path: true, durationSec: true },
  orderBy: { id: 'asc' },
  take: 1,
} as const;

const itemInclude = {
  category: { select: { id: true, name: true, slug: true } },
  mediaAssets: readyAudio,
} satisfies Prisma.EpisodeInclude;

type EpisodeRow = Prisma.EpisodeGetPayload<{ include: typeof itemInclude }>;

/**
 * What users may see: PUBLISHED and already due. Status alone is enough in normal operation;
 * the time check is a second lock so an episode with a future publish time can never leak.
 */
const publishedWhere = (now: Date) =>
  ({ status: 'PUBLISHED', publishedAt: { lte: now } }) satisfies Prisma.EpisodeWhereInput;

const SORTS: Record<ListEpisodesQuery['sort'], Direction> = {
  newest: 'desc',
  oldest: 'asc',
  longest: 'desc',
};

export interface CatalogDeps {
  db: Db;
  media: MediaUrls;
  /** Injectable clock, for tests. */
  now?: () => Date;
}

export function createCatalogService(deps: CatalogDeps) {
  const { db, media } = deps;
  const clock = deps.now ?? (() => new Date());

  /** Published episodes matching `where`, reduced to { id, key } for sorting and paging. */
  async function candidates(
    where: Prisma.EpisodeWhereInput,
    now: Date,
    keyOf: 'publishedAt' | 'duration' = 'publishedAt',
  ): Promise<Array<Entry & { publishedAt: number }>> {
    const rows = await db.episode.findMany({
      where: { AND: [publishedWhere(now), where] },
      select: { id: true, publishedAt: true, mediaAssets: readyAudio },
    });
    return rows.map((r) => {
      const publishedAt = r.publishedAt?.getTime() ?? 0;
      const duration = r.mediaAssets[0]?.durationSec ?? 0;
      return { id: r.id, publishedAt, key: keyOf === 'duration' ? duration : publishedAt };
    });
  }

  /** Full list items for these ids, in the same order, with this user's progress and saved flag. */
  async function itemsFor(userId: string, ids: string[], now: Date): Promise<EpisodeItem[]> {
    if (ids.length === 0) return [];
    const [rows, progress, saved] = await Promise.all([
      db.episode.findMany({
        where: { AND: [publishedWhere(now), { id: { in: ids } }] },
        include: itemInclude,
      }),
      db.playbackProgress.findMany({ where: { userId, episodeId: { in: ids } } }),
      db.savedEpisode.findMany({
        where: { userId, episodeId: { in: ids } },
        select: { episodeId: true },
      }),
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const progressById = new Map(progress.map((p) => [p.episodeId, p]));
    const savedIds = new Set(saved.map((s) => s.episodeId));

    const items: EpisodeItem[] = [];
    for (const id of ids) {
      const ep = byId.get(id);
      if (!ep) continue; // unpublished between the two queries
      const p = progressById.get(id);
      items.push(
        toItem(
          ep,
          now,
          p ? { positionSec: p.positionSec, completed: p.completed } : null,
          savedIds.has(id),
        ),
      );
    }
    return items;
  }

  function toItem(
    ep: EpisodeRow,
    now: Date,
    progress: EpisodeItem['progress'],
    saved: boolean,
  ): EpisodeItem {
    return {
      id: ep.id,
      title: ep.title,
      category: ep.category,
      ...media.cover(ep.coverPath, now),
      durationSec: ep.mediaAssets[0]?.durationSec ?? null,
      publishedAt: (ep.publishedAt ?? ep.createdAt).toISOString(),
      progress,
      saved,
    };
  }

  async function categories(now: Date): Promise<CategoryDto[]> {
    const rows = await db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { episodes: { where: publishedWhere(now) } } },
      },
    });
    // A category with nothing published is not shown (it would reveal unpublished work).
    return rows
      .filter((r) => r._count.episodes > 0)
      .map((r) => ({ id: r.id, name: r.name, slug: r.slug, episodeCount: r._count.episodes }));
  }

  async function requirePublished(episodeId: string, now: Date) {
    const ep = await db.episode.findFirst({
      where: { AND: [publishedWhere(now), { id: episodeId }] },
      select: { id: true },
    });
    if (!ep) throw new AppError(404, 'NOT_FOUND');
  }

  /** Create-if-missing races (two parallel PUTs) surface as P2002; the row exists then. */
  const isDuplicate = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002';

  return {
    categories: () => categories(clock()),

    async listEpisodes(userId: string, q: ListEpisodesQuery): Promise<EpisodesPage> {
      const now = clock();
      const where: Prisma.EpisodeWhereInput[] = [];
      if (q.category) where.push({ category: { OR: [{ id: q.category }, { slug: q.category }] } });
      if (q.q) {
        const needle = escapeLike(q.q);
        where.push({
          OR: [{ title: { contains: needle } }, { description: { contains: needle } }],
        });
      }

      const entries = await candidates(
        { AND: where },
        now,
        q.sort === 'longest' ? 'duration' : 'publishedAt',
      );
      const page = pageAfter(
        entries,
        SORTS[q.sort],
        q.limit,
        q.cursor ? decodeCursor(q.cursor) : undefined,
      );
      return {
        items: await itemsFor(
          userId,
          page.items.map((e) => e.id),
          now,
        ),
        nextCursor: page.nextCursor,
      };
    },

    async episodeDetail(userId: string, id: string): Promise<EpisodeDetail> {
      const now = clock();
      const ep = await db.episode.findFirst({
        where: { AND: [publishedWhere(now), { id }] },
        include: itemInclude,
      });
      if (!ep) throw new AppError(404, 'NOT_FOUND');

      // "Дараагийн": the next episodes of the same category, oldest-first after this one.
      const siblings = await candidates({ categoryId: ep.categoryId }, now);
      const after = pageAfter(siblings, 'asc', NEXT_ROW, {
        k: ep.publishedAt?.getTime() ?? 0,
        id: ep.id,
      });
      const [[item], next] = await Promise.all([
        itemsFor(userId, [ep.id], now),
        itemsFor(
          userId,
          after.items.map((e) => e.id),
          now,
        ),
      ]);
      return { ...item!, description: ep.description, next };
    },

    async home(userId: string): Promise<HomeResponse> {
      const now = clock();
      const [recent, published, cats] = await Promise.all([
        db.playbackProgress.findMany({
          where: { userId, completed: false, positionSec: { gt: 0 }, episode: publishedWhere(now) },
          orderBy: { updatedAt: 'desc' },
          take: HOME_ROW,
          select: { episodeId: true },
        }),
        candidates({}, now),
        categories(now),
      ]);
      const newest = pageAfter(published, 'desc', published.length || 1);
      const weekAgo = now.getTime() - 7 * DAY_MS;
      const [continueListening, latest, thisWeek] = await Promise.all([
        itemsFor(
          userId,
          recent.map((r) => r.episodeId),
          now,
        ),
        itemsFor(
          userId,
          newest.items.slice(0, HOME_ROW).map((e) => e.id),
          now,
        ),
        itemsFor(
          userId,
          newest.items
            .filter((e) => e.key >= weekAgo) // key = publish time for this candidate list
            .slice(0, HOME_ROW)
            .map((e) => e.id),
          now,
        ),
      ]);
      return { continueListening, latest, categories: cats, thisWeek };
    },

    /**
     * SPEC G / acceptance: playback needs active access and a registered device. The URL is valid
     * for 4 hours but never past the end of access, so expired access stops playback (ADR-0021).
     */
    async play(auth: { user: User; session: Session }, episodeId: string): Promise<PlayResponse> {
      const now = clock();
      const { user, session } = auth;

      if (!user.accessUntil || user.accessUntil.getTime() <= now.getTime()) {
        throw new AppError(403, 'NO_ACCESS');
      }
      const device = await db.device.findUnique({
        where: { userId_deviceId: { userId: user.id, deviceId: session.deviceId } },
        select: { id: true },
      });
      if (!device) throw new AppError(403, 'DEVICE_NOT_REGISTERED');
      if (!media.enabled) throw new AppError(503, 'SERVICE_UNAVAILABLE');

      const ep = await db.episode.findFirst({
        where: { AND: [publishedWhere(now), { id: episodeId }] },
        select: { id: true, mediaAssets: readyAudio },
      });
      if (!ep) throw new AppError(404, 'NOT_FOUND');
      const asset = ep.mediaAssets[0];
      if (!asset) throw new AppError(409, 'MEDIA_NOT_READY');

      const expiresAt = new Date(
        Math.min(now.getTime() + PLAY_URL_TTL_MS, user.accessUntil.getTime()),
      );
      await db.device.update({ where: { id: device.id }, data: { lastSeenAt: now } });
      return {
        url: media.audio(asset.path, expiresAt),
        expiresAt: expiresAt.toISOString(),
        durationSec: asset.durationSec,
      };
    },

    /** Last write wins; one cheap upsert so clients can save every few seconds. */
    async saveProgress(
      userId: string,
      episodeId: string,
      body: SaveProgressRequest,
    ): Promise<void> {
      await requirePublished(episodeId, clock());
      const data = { positionSec: body.positionSec, completed: body.completed ?? false };
      const where = { userId_episodeId: { userId, episodeId } };
      try {
        await db.playbackProgress.upsert({
          where,
          create: { userId, episodeId, ...data },
          update: data,
        });
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        await db.playbackProgress.update({ where, data });
      }
    },

    async save(userId: string, episodeId: string): Promise<void> {
      await requirePublished(episodeId, clock());
      try {
        await db.savedEpisode.upsert({
          where: { userId_episodeId: { userId, episodeId } },
          create: { userId, episodeId },
          update: {}, // already saved: keep the original time
        });
      } catch (err) {
        if (!isDuplicate(err)) throw err;
      }
    },

    /** Works for any episode id, including ones unpublished since. Removing nothing is fine. */
    async unsave(userId: string, episodeId: string): Promise<void> {
      await db.savedEpisode.deleteMany({ where: { userId, episodeId } });
    },

    async listSaved(userId: string, q: { limit: number; cursor?: string }): Promise<EpisodesPage> {
      const now = clock();
      const rows = await db.savedEpisode.findMany({
        where: { userId, episode: publishedWhere(now) },
        select: { episodeId: true, createdAt: true },
      });
      const entries: Entry[] = rows.map((r) => ({ id: r.episodeId, key: r.createdAt.getTime() }));
      const page = pageAfter(
        entries,
        'desc',
        q.limit,
        q.cursor ? decodeCursor(q.cursor) : undefined,
      );
      return {
        items: await itemsFor(
          userId,
          page.items.map((e) => e.id),
          now,
        ),
        nextCursor: page.nextCursor,
      };
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
