import { z } from 'zod';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from './admin';

// /v1/admin categories, episodes and uploads (SPEC G). Roles ADMIN and OWNER, password login only (ADR-0040).

const idSchema = z.string().min(1).max(64);
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const contentIdParamsSchema = z.object({ id: idSchema });

// ---- Categories ----

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(2)
  .max(60);

export const categoryNameSchema = z.string().trim().min(1).max(100);

export const adminCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  sortOrder: z.number().int(),
  episodeCount: z.number().int(),
});
export type AdminCategoryDto = z.infer<typeof adminCategorySchema>;
export const adminCategoriesResponseSchema = z.object({ categories: z.array(adminCategorySchema) });
export const adminCategoryResponseSchema = z.object({ category: adminCategorySchema });

export const createCategoryRequestSchema = z.object({
  name: categoryNameSchema,
  slug: slugSchema,
});
export const updateCategoryRequestSchema = z
  .object({ name: categoryNameSchema, slug: slugSchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
/** The new order: every category id, first to last. */
export const reorderCategoriesRequestSchema = z.object({ ids: z.array(idSchema).min(1).max(200) });

// ---- Tags ----

export const adminTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  episodeCount: z.number().int(),
});
export type AdminTagDto = z.infer<typeof adminTagSchema>;
export const adminTagsResponseSchema = z.object({ tags: z.array(adminTagSchema) });
export const adminTagResponseSchema = z.object({ tag: adminTagSchema });
/** The slug is derived on the server from the name. */
export const createTagRequestSchema = z.object({ name: categoryNameSchema });
export const updateTagRequestSchema = z.object({ name: categoryNameSchema });

// ---- Episodes ----

export const episodeStatusSchema = z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']);
export type EpisodeStatus = z.infer<typeof episodeStatusSchema>;
export const mediaStatusSchema = z.enum(['UPLOADING', 'PROCESSING', 'READY', 'FAILED']);

/** One media file per episode, audio or video (ADR-0038). */
export const mediaKindSchema = z.enum(['AUDIO', 'VIDEO']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const ALLOWED_AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav'] as const;
export const MAX_AUDIO_BYTES = 512 * 1024 * 1024;
export const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v'] as const;
/** A 40-minute 720p export is about 0.5–1.5 GB (ASSUMPTION, docs/reports/VIDEO-2026-10-18.md). */
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;

/** AUDIO or VIDEO from a file name's extension; null when neither is allowed. */
export function mediaKindOfFile(filename: string): MediaKind | null {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if ((ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(extension)) return 'AUDIO';
  if ((ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(extension)) return 'VIDEO';
  return null;
}

export const maxBytesOf = (kind: MediaKind) =>
  kind === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES;
export const MAX_COVER_BYTES = 10 * 1024 * 1024;

export const adminMediaSchema = z.object({
  id: z.string(),
  kind: mediaKindSchema,
  status: mediaStatusSchema,
  /** Why the file could not be stored or processed (status FAILED). */
  failReason: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  durationSec: z.number().int().nullable(),
});

export const adminEpisodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: episodeStatusSchema,
  category: z.object({ id: z.string(), name: z.string() }),
  /** Signed cover URLs; null until a cover is stored (or when storage is not configured). */
  coverUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  hasCover: z.boolean(),
  scheduledFor: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  media: adminMediaSchema.nullable(),
  /** What is still missing before the episode can be published: cover and/or a ready media file. */
  missing: z.array(z.enum(['cover', 'media'])),
});
export type AdminEpisodeDto = z.infer<typeof adminEpisodeSchema>;
export const adminEpisodeResponseSchema = z.object({ episode: adminEpisodeSchema });

export const listAdminEpisodesQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, episodeStatusSchema.optional()),
  categoryId: z.preprocess(emptyToUndefined, idSchema.optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).optional()),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type ListAdminEpisodesQuery = z.infer<typeof listAdminEpisodesQuerySchema>;
export const adminEpisodesPageSchema = z.object({
  items: z.array(adminEpisodeSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export const createEpisodeRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  categoryId: idSchema,
});
export const updateEpisodeRequestSchema = createEpisodeRequestSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);

/** An instant with its offset, e.g. "2026-10-20T09:00:00+08:00" (Asia/Ulaanbaatar). */
export const scheduleRequestSchema = z.object({ scheduledFor: z.iso.datetime({ offset: true }) });

// ---- Subscription history and device removal (admin) ----

export const removeDeviceParamsSchema = z.object({ id: idSchema, deviceId: idSchema });
