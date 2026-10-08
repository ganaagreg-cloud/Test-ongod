import { z } from 'zod';

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
});
export type CategoryDto = z.infer<typeof categorySchema>;
export const categoriesResponseSchema = z.object({ categories: z.array(categorySchema) });

export const episodeCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

/** One row of any episode list (library, home, saved). */
export const episodeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: episodeCategorySchema,
  /** Signed Bunny URLs; null only if Bunny is not configured. */
  coverUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  /** From the READY audio file; null when there is none. */
  durationSec: z.number().int().nonnegative().nullable(),
  publishedAt: z.iso.datetime(),
  /** This user's progress, or null if never played. */
  progress: z
    .object({ positionSec: z.number().int().nonnegative(), completed: z.boolean() })
    .nullable(),
  saved: z.boolean(),
});
export type EpisodeItem = z.infer<typeof episodeItemSchema>;

export const episodeDetailSchema = episodeItemSchema.extend({
  description: z.string(),
  /** Up to 5 episodes of the same category published after this one ("Дараагийн"). */
  next: z.array(episodeItemSchema),
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

export const homeResponseSchema = z.object({
  continueListening: z.array(episodeItemSchema),
  latest: z.array(episodeItemSchema),
  categories: z.array(categorySchema),
  thisWeek: z.array(episodeItemSchema),
});
export type HomeResponse = z.infer<typeof homeResponseSchema>;

// ---- POST /v1/episodes/:id/play ----

export const playResponseSchema = z.object({
  /** Bunny token-authenticated URL for the audio file. */
  url: z.string(),
  /** ISO time the URL stops working. Never later than the end of the user's access. */
  expiresAt: z.iso.datetime(),
  durationSec: z.number().int().nonnegative().nullable(),
});
export type PlayResponse = z.infer<typeof playResponseSchema>;

// ---- PUT /v1/progress/:episodeId ----

/** 24 h: far above any episode, rejects nonsense. */
export const MAX_POSITION_SEC = 86_400;

export const saveProgressRequestSchema = z.object({
  positionSec: z.number().int().min(0).max(MAX_POSITION_SEC),
  completed: z.boolean().default(false),
});
export type SaveProgressRequest = z.input<typeof saveProgressRequestSchema>;
