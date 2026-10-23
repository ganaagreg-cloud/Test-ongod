import { z } from 'zod';
import { mediaKindSchema } from './admin-content';

// Request/response schemas for the catalog, playback, progress and saved endpoints (SPEC G).
// Nothing here carries a price or plan: the apps never show them.

export const EPISODE_PAGE_DEFAULT = 20;
export const EPISODE_PAGE_MAX = 50;

const idParam = z.string().min(1).max(64);
export const episodeIdParamsSchema = z.object({ episodeId: idParam });
export const episodeParamsSchema = z.object({ id: idParam });

// ---- DTOs ----

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  /** Published episodes in the category. */
  episodeCount: z.number().int().nonnegative(),
  /** Signed URL of the category photo (`coverPath`); null when there is none (or no Bunny). */
  coverUrl: z.string().nullable(),
});
export type CategoryDto = z.infer<typeof categorySchema>;
export const categoriesResponseSchema = z.object({ categories: z.array(categorySchema) });

export const episodeCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

export const episodeSeriesSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Part number within the series; null when the episode has none. */
  part: z.number().int().nullable(),
});

export const tagSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() });
export type TagDto = z.infer<typeof tagSchema>;
export const tagsResponseSchema = z.object({ tags: z.array(tagSchema) });

/** One row of any episode list (library, home, saved). */
export const episodeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: episodeCategorySchema,
  /** Signed Bunny URLs; null only if Bunny is not configured. */
  coverUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  /** From the READY media file; null when there is none. */
  durationSec: z.number().int().nonnegative().nullable(),
  /** AUDIO or VIDEO (ADR-0038); null until the episode has a READY media file. */
  mediaKind: mediaKindSchema.nullable(),
  publishedAt: z.iso.datetime(),
  /** Playable by any logged-in user, without active access (ADR-0043, ADR-0044). */
  isFree: z.boolean(),
  /** This user's progress, or null if never played. */
  progress: z
    .object({ positionSec: z.number().int().nonnegative(), completed: z.boolean() })
    .nullable(),
  saved: z.boolean(),
  series: episodeSeriesSchema.nullable(),
  tags: z.array(tagSchema),
});
export type EpisodeItem = z.infer<typeof episodeItemSchema>;

export const episodeDetailSchema = episodeItemSchema.extend({
  description: z.string(),
  /** Up to 5 episodes of the same category published after this one ("Дараагийн"). */
  next: z.array(episodeItemSchema),
  /** The next published part of the same series; null at the end or outside a series. */
  nextInSeries: episodeItemSchema.nullable(),
});
export type EpisodeDetail = z.infer<typeof episodeDetailSchema>;
export const episodeDetailResponseSchema = z.object({ episode: episodeDetailSchema });

// ---- GET /v1/episodes, GET /v1/saved ----

export const episodeSortSchema = z.enum(['newest', 'oldest', 'longest']);
export type EpisodeSort = z.infer<typeof episodeSortSchema>;

const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(EPISODE_PAGE_MAX)
  .default(EPISODE_PAGE_DEFAULT);
const cursorSchema = z.string().min(1).max(200);

export const listEpisodesQuerySchema = z.object({
  /** Category id or slug. */
  category: z.string().trim().min(1).max(64).optional(),
  /** Tag id or slug. */
  tag: z.string().trim().min(1).max(64).optional(),
  /** Series id or slug. */
  series: z.string().trim().min(1).max(64).optional(),
  /** Searches title and description. */
  q: z.string().trim().min(1).max(100).optional(),
  sort: episodeSortSchema.default('newest'),
  limit: limitSchema,
  cursor: cursorSchema.optional(),
});
export type ListEpisodesQuery = z.infer<typeof listEpisodesQuerySchema>;

export const listSavedQuerySchema = z.object({
  limit: limitSchema,
  cursor: cursorSchema.optional(),
});

export const episodesPageSchema = z.object({
  items: z.array(episodeItemSchema),
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: z.string().nullable(),
});
export type EpisodesPage = z.infer<typeof episodesPageSchema>;

// ---- GET /v1/home ----

/** The next scheduled episode within 7 days ("Энэ 7 хоногт", ADR-0039). Not playable yet. */
export const nextReleaseSchema = z.object({
  title: z.string(),
  category: episodeCategorySchema,
  scheduledFor: z.iso.datetime(),
});
export type NextRelease = z.infer<typeof nextReleaseSchema>;

export const homeResponseSchema = z.object({
  continueListening: z.array(episodeItemSchema),
  latest: z.array(episodeItemSchema),
  categories: z.array(categorySchema),
  thisWeek: z.array(episodeItemSchema),
  nextRelease: nextReleaseSchema.nullable(),
  /** Items of the "Онцлох" playlist, in its order. */
  featured: z.array(episodeItemSchema),
  /** Playlists shown on home, by homeOrder; empty ones are left out. */
  playlists: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      slug: z.string(),
      items: z.array(episodeItemSchema),
    }),
  ),
});
export type HomeResponse = z.infer<typeof homeResponseSchema>;

// ---- POST /v1/episodes/:id/play ----

export const playResponseSchema = z.object({
  kind: mediaKindSchema,
  /**
   * Bunny token-authenticated URL: the audio file, or for VIDEO the HLS playlist (`.m3u8`) with
   * the token in its path, so the segments it lists are covered too (ADR-0038).
   */
  url: z.string(),
  /** ISO time the URL stops working. Never later than the end of the user's access. */
  expiresAt: z.iso.datetime(),
  durationSec: z.number().int().nonnegative().nullable(),
});
export type PlayResponse = z.infer<typeof playResponseSchema>;

// ---- GET /v1/me/stats ----

/** The numbers on the profile (ADR-0039). */
export const meStatsResponseSchema = z.object({
  /** Episodes this member has finished. */
  completedEpisodes: z.number().int().nonnegative(),
  /** Listening time: the duration of finished episodes plus the saved position of the others. */
  listenedSec: z.number().int().nonnegative(),
});
export type MeStats = z.infer<typeof meStatsResponseSchema>;

// ---- PUT /v1/progress/:episodeId ----

/** 24 h: far above any episode, rejects nonsense. */
export const MAX_POSITION_SEC = 86_400;

export const saveProgressRequestSchema = z.object({
  positionSec: z.number().int().min(0).max(MAX_POSITION_SEC),
  completed: z.boolean().default(false),
});
export type SaveProgressRequest = z.input<typeof saveProgressRequestSchema>;

// ---- GET /v1/series/:id, GET /v1/playlists/:id ----

const collectionBase = {
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  coverUrl: z.string().nullable(),
  items: z.array(episodeItemSchema),
};
export const seriesPageSchema = z.object(collectionBase);
export const seriesResponseSchema = z.object({ series: seriesPageSchema });
export const playlistPageSchema = z.object(collectionBase);
export const playlistResponseSchema = z.object({ playlist: playlistPageSchema });
export type SeriesPage = z.infer<typeof seriesPageSchema>;
export type PlaylistPage = z.infer<typeof playlistPageSchema>;
