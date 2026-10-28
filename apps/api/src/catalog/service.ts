import type {
  CategoryDto,
  EpisodeDetail,
  EpisodeItem,
  EpisodesPage,
  HomeResponse,
  ListEpisodesQuery,
  MeStats,
  PlayResponse,
  PlaylistPage,
  SaveProgressRequest,
  SeriesPage,
  TagDto,
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
/** The id the admin playlist service gives the "Онцлох" playlist (created lazily there). */
const FEATURED_PLAYLIST_ID = 'featured';

/** The READY media file of an episode, audio or video (SPEC G: media status Ready; ADR-0038). */
const readyMedia = {
  where: { status: 'READY' },
  select: { path: true, durationSec: true, kind: true },
  orderBy: { id: 'desc' },
  take: 1,
} as const;

const itemInclude = {
  category: { select: { id: true, name: true, slug: true } },
  mediaAssets: readyMedia,
  series: { select: { id: true, title: true } },
  tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.EpisodeInclude;

type EpisodeRow = Prisma.EpisodeGetPayload<{ include: typeof itemInclude }>;

/**
 * What users may see: PUBLISHED and already due. Status alone is enough in normal operation;
 * the time check is a second lock so an episode with a future publish time can never leak.
 */
export const publishedWhere = (now: Date) =>
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
      select: { id: true, publishedAt: true, mediaAssets: readyMedia },
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
      mediaKind: ep.mediaAssets[0]?.kind ?? null,
      publishedAt: (ep.publishedAt ?? ep.createdAt).toISOString(),
      isFree: ep.isFree,
      progress,
      saved,
      series: ep.series ? { id: ep.series.id, title: ep.series.title, part: ep.seriesPart } : null,
      tags: ep.tags
        .map((t) => t.tag)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    };
  }

  /** Ids of published episodes in a playlist, by position. Unpublished ones are never selected. */
  async function playlistEpisodeIds(
    playlistId: string,
    now: Date,
    take?: number,
  ): Promise<string[]> {
    const rows = await db.playlistItem.findMany({
      where: { playlistId, episode: publishedWhere(now) },
      orderBy: [{ position: 'asc' }, { episodeId: 'asc' }],
      select: { episodeId: true },
      ...(take ? { take } : {}),
    });
    return rows.map((r) => r.episodeId);
  }

  async function categories(now: Date): Promise<CategoryDto[]> {
    const rows = await db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        coverPath: true,
        _count: { select: { episodes: { where: publishedWhere(now) } } },
      },
    });
    // A category with nothing published is not shown (it would reveal unpublished work).
    return rows
      .filter((r) => r._count.episodes > 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        episodeCount: r._count.episodes,
        coverUrl: r.coverPath ? media.cover(r.coverPath, now).coverUrl : null,
      }));
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
      if (q.tag) where.push({ tags: { some: { tag: { OR: [{ id: q.tag }, { slug: q.tag }] } } } });
      if (q.series) where.push({ series: { OR: [{ id: q.series }, { slug: q.series }] } });
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

      // The next PUBLISHED part: a draft part in between is skipped, never named.
      let nextInSeries: EpisodeItem | null = null;
      if (ep.seriesId && ep.seriesPart !== null) {
        const following = await db.episode.findFirst({
          where: {
            AND: [
              publishedWhere(now),
              { seriesId: ep.seriesId, seriesPart: { gt: ep.seriesPart } },
            ],
          },
          orderBy: [{ seriesPart: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (following) nextInSeries = (await itemsFor(userId, [following.id], now))[0] ?? null;
      }
      return { ...item!, description: ep.description, next, nextInSeries };
    },

    async home(userId: string): Promise<HomeResponse> {
      const now = clock();
      const [recent, published, cats, upcoming, featuredIds, homePlaylists] = await Promise.all([
        db.playbackProgress.findMany({
          where: { userId, completed: false, positionSec: { gt: 0 }, episode: publishedWhere(now) },
          orderBy: { updatedAt: 'desc' },
          take: HOME_ROW,
          select: { episodeId: true },
        }),
        candidates({}, now),
        categories(now),
        // "Энэ 7 хоногт": the next scheduled episode due within a week (ADR-0039).
        db.episode.findFirst({
          where: {
            status: 'SCHEDULED',
            scheduledFor: { gt: now, lte: new Date(now.getTime() + 7 * DAY_MS) },
          },
          orderBy: { scheduledFor: 'asc' },
          select: { title: true, scheduledFor: true, category: itemInclude.category },
        }),
        playlistEpisodeIds(FEATURED_PLAYLIST_ID, now, HOME_ROW),
        db.playlist.findMany({
          where: { showOnHome: true, isFeatured: false },
          orderBy: [{ homeOrder: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, slug: true },
        }),
      ]);
      const playlistRows = await Promise.all(
        homePlaylists.map(async (p) => ({
          ...p,
          ids: await playlistEpisodeIds(p.id, now, HOME_ROW),
        })),
      );
      const newest = pageAfter(published, 'desc', published.length || 1);
      const weekAgo = now.getTime() - 7 * DAY_MS;
      const [continueListening, latest, thisWeek, featured, playlistItems] = await Promise.all([
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
        itemsFor(userId, featuredIds, now),
        itemsFor(userId, [...new Set(playlistRows.flatMap((p) => p.ids))], now),
      ]);
      const itemById = new Map(playlistItems.map((i) => [i.id, i]));
      const playlists = playlistRows
        .map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          items: p.ids.flatMap((id) => itemById.get(id) ?? []),
        }))
        .filter((p) => p.items.length > 0);
      const nextRelease =
        upcoming?.scheduledFor != null
          ? {
              title: upcoming.title,
              category: upcoming.category,
              scheduledFor: upcoming.scheduledFor.toISOString(),
            }
          : null;
      return {
        continueListening,
        latest,
        categories: cats,
        thisWeek,
        nextRelease,
        featured,
        playlists,
      };
    },

    /** Only published parts, by part number (real numbers, so gaps are not filled in). */
    async seriesPage(userId: string, id: string): Promise<SeriesPage> {
      const now = clock();
      const series = await db.series.findUnique({ where: { id } });
      if (!series) throw new AppError(404, 'NOT_FOUND');
      const rows = await db.episode.findMany({
        where: { AND: [publishedWhere(now), { seriesId: id }] },
        select: { id: true, seriesPart: true, publishedAt: true },
      });
      if (rows.length === 0) throw new AppError(404, 'NOT_FOUND');
      const last = Number.MAX_SAFE_INTEGER;
      rows.sort(
        (a, b) =>
          (a.seriesPart ?? last) - (b.seriesPart ?? last) ||
          (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0) ||
          a.id.localeCompare(b.id),
      );
      const items = await itemsFor(
        userId,
        rows.map((r) => r.id),
        now,
      );
      return {
        id: series.id,
        title: series.title,
        slug: series.slug,
        description: series.description,
        coverUrl: series.coverPath ? media.cover(series.coverPath, now).coverUrl : null,
        items,
      };
    },

    /** Only published items, by position. A playlist with none published does not exist. */
    async playlistPage(userId: string, id: string): Promise<PlaylistPage> {
      const now = clock();
      const playlist = await db.playlist.findUnique({ where: { id } });
      if (!playlist) throw new AppError(404, 'NOT_FOUND');
      const items = await itemsFor(userId, await playlistEpisodeIds(id, now), now);
      if (items.length === 0) throw new AppError(404, 'NOT_FOUND');
      return {
        id: playlist.id,
        title: playlist.title,
        slug: playlist.slug,
        description: playlist.description,
        coverUrl: playlist.coverPath ? media.cover(playlist.coverPath, now).coverUrl : null,
        items,
      };
    },

    /** Tags with at least one published episode (a draft-only tag would reveal unpublished work). */
    async tags(): Promise<TagDto[]> {
      const now = clock();
      return db.tag.findMany({
        where: { episodes: { some: { episode: publishedWhere(now) } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, slug: true },
      });
    },

    /**
     * Profile numbers (ADR-0039): finished episodes, and listening time = the duration of a
     * finished episode (its saved position if the duration is unknown) or the saved position.
     */
    async stats(userId: string): Promise<MeStats> {
      const rows = await db.playbackProgress.findMany({
        where: { userId },
        select: {
          positionSec: true,
          completed: true,
          episode: { select: { mediaAssets: { ...readyMedia, select: { durationSec: true } } } },
        },
      });
      let listenedSec = 0;
      for (const row of rows) {
        const duration = row.episode.mediaAssets[0]?.durationSec ?? null;
        listenedSec += row.completed && duration !== null ? duration : row.positionSec;
      }
      return {
        completedEpisodes: rows.filter((r) => r.completed).length,
        listenedSec,
      };
    },

    /**
     * SPEC G / acceptance: playback needs a login, a registered device, and either active access
     * or a published free item (ADR-0043). Without access, anything that is not a published free
     * item is 403 NO_ACCESS, checked first, so unpublished items do not leak. A member's URL is
     * valid for 4 hours but never past the end of access, so expired access stops paid playback
     * (ADR-0021); a free play without access gets the full 4 hours (never an already-expired URL).
     */
    async play(auth: { user: User; session: Session }, episodeId: string): Promise<PlayResponse> {
      const now = clock();
      const { user, session } = auth;

      const accessUntil =
        user.accessUntil != null && user.accessUntil.getTime() > now.getTime()
          ? user.accessUntil
          : null;
      if (!accessUntil) {
        const free = await db.episode.findFirst({
          where: { AND: [publishedWhere(now), { id: episodeId, isFree: true }] },
          select: { id: true },
        });
        if (!free) throw new AppError(403, 'NO_ACCESS');
      }
      const device = await db.device.findUnique({
        where: { userId_deviceId: { userId: user.id, deviceId: session.deviceId } },
        select: { id: true },
      });
      if (!device) throw new AppError(403, 'DEVICE_NOT_REGISTERED');
      if (!media.enabled) throw new AppError(503, 'SERVICE_UNAVAILABLE');

      const ep = await db.episode.findFirst({
        where: { AND: [publishedWhere(now), { id: episodeId }] },
        select: { id: true, mediaAssets: readyMedia },
      });
      if (!ep) throw new AppError(404, 'NOT_FOUND');
      const asset = ep.mediaAssets[0];
      if (!asset) throw new AppError(409, 'MEDIA_NOT_READY');
      // Video needs Bunny Stream on top of the storage pull zone.
      if (asset.kind === 'VIDEO' && !media.videoEnabled) {
        throw new AppError(503, 'SERVICE_UNAVAILABLE');
      }

      const ttlEnd = now.getTime() + PLAY_URL_TTL_MS;
      const expiresAt = new Date(accessUntil ? Math.min(ttlEnd, accessUntil.getTime()) : ttlEnd);
      await db.device.update({ where: { id: device.id }, data: { lastSeenAt: now } });
      return {
        kind: asset.kind,
        url:
          asset.kind === 'VIDEO'
            ? media.video(asset.path, expiresAt)
            : media.audio(asset.path, expiresAt),
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
