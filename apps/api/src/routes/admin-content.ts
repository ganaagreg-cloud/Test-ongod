import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  adminCategoriesResponseSchema,
  adminCategoryResponseSchema,
  adminEpisodeResponseSchema,
  adminPlaylistDetailResponseSchema,
  adminPlaylistListResponseSchema,
  adminSeriesDetailResponseSchema,
  adminSeriesListResponseSchema,
  adminEpisodesPageSchema,
  adminTagResponseSchema,
  adminTagsResponseSchema,
  bulkRequestSchema,
  bulkResponseSchema,
  contentIdParamsSchema,
  createCategoryRequestSchema,
  createEpisodeRequestSchema,
  createPlaylistRequestSchema,
  createSeriesRequestSchema,
  createTagRequestSchema,
  listAdminEpisodesQuerySchema,
  MAX_COVER_BYTES,
  playlistItemParamsSchema,
  playlistItemsRequestSchema,
  previewResponseSchema,
  removeDeviceParamsSchema,
  reorderCategoriesRequestSchema,
  reorderHomeRequestSchema,
  reorderPlaylistRequestSchema,
  reorderSeriesRequestSchema,
  scheduleRequestSchema,
  updateCategoryRequestSchema,
  updateEpisodeRequestSchema,
  updatePlaylistRequestSchema,
  updateSeriesRequestSchema,
  updateTagRequestSchema,
} from '@ongod/shared';
import type { AdminGuards } from '../admin/guard';
import type { BulkService } from '../admin/bulk';
import type { ContentService } from '../admin/content';
import type { PlaylistService } from '../admin/playlists';
import type { SeriesService } from '../admin/series';
import type { TagService } from '../admin/tags';
import { authOf } from '../auth/guard';
import { AppError } from '../errors';
import { ADMIN_HEADER, type TusUploads } from '../media/tus';
import { sniffImage } from '../subscriptions/receipts';

const isMultipartError = (err: unknown, code: string) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;

/** Reads the `cover` file of a multipart request: JPEG, PNG or WebP, at most 10 MB. */
async function readCover(req: FastifyRequest): Promise<Buffer> {
  if (!req.isMultipart()) throw new AppError(400, 'COVER_INVALID');
  try {
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      if (part.fieldname !== 'cover') {
        part.file.resume();
        continue;
      }
      const data = await part.toBuffer();
      if (data.length === 0 || !sniffImage(data)) throw new AppError(400, 'COVER_INVALID');
      return data;
    }
  } catch (err) {
    if (isMultipartError(err, 'FST_REQ_FILE_TOO_LARGE')) throw new AppError(413, 'COVER_TOO_LARGE');
    throw err;
  }
  throw new AppError(400, 'COVER_INVALID');
}

/**
 * /v1/admin categories, episodes and the resumable audio upload (SPEC G). Everything needs an
 * ADMIN/OWNER session.
 */
export async function adminContentRoutes(
  app: FastifyInstance,
  opts: {
    guards: AdminGuards;
    content: ContentService;
    tags: TagService;
    series: SeriesService;
    playlists: PlaylistService;
    bulk: BulkService;
    tus: TusUploads;
  },
) {
  const { content, tags, series, playlists, bulk, tus } = opts;
  app.addHook('preHandler', opts.guards.requireAdmin);
  app.addHook('onSend', async (_req, reply) => {
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'private, no-store');
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_COVER_BYTES, files: 1, fields: 2, parts: 4 },
  });
  // tus uploads arrive as application/offset+octet-stream; the tus server reads the stream itself.
  app.addContentTypeParser('application/offset+octet-stream', (_req, _payload, done) => done(null));

  // ---- categories ----
  app.get('/admin/categories', async () =>
    adminCategoriesResponseSchema.parse({ categories: await content.listCategories() }),
  );

  app.post('/admin/categories', async (req, reply) => {
    const body = createCategoryRequestSchema.parse(req.body);
    const category = await content.createCategory(authOf(req).user, body);
    return reply.code(201).send(adminCategoryResponseSchema.parse({ category }));
  });

  app.post('/admin/categories/reorder', async (req) => {
    const body = reorderCategoriesRequestSchema.parse(req.body);
    return adminCategoriesResponseSchema.parse({
      categories: await content.reorderCategories(authOf(req).user, body.ids),
    });
  });

  app.patch('/admin/categories/:id', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const body = updateCategoryRequestSchema.parse(req.body);
    return adminCategoryResponseSchema.parse({
      category: await content.updateCategory(authOf(req).user, id, body),
    });
  });

  app.delete('/admin/categories/:id', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    await content.deleteCategory(authOf(req).user, id);
    return reply.code(204).send();
  });

  // ---- tags ----
  app.get('/admin/tags', async () => adminTagsResponseSchema.parse({ tags: await tags.list() }));

  app.post('/admin/tags', async (req, reply) => {
    const body = createTagRequestSchema.parse(req.body);
    const tag = await tags.create(authOf(req).user, body);
    return reply.code(201).send(adminTagResponseSchema.parse({ tag }));
  });

  app.patch('/admin/tags/:id', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const body = updateTagRequestSchema.parse(req.body);
    return adminTagResponseSchema.parse({ tag: await tags.rename(authOf(req).user, id, body) });
  });

  app.delete('/admin/tags/:id', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    await tags.remove(authOf(req).user, id);
    return reply.code(204).send();
  });

  // ---- series ----
  const seriesReply = (detail: Awaited<ReturnType<SeriesService['get']>>) =>
    adminSeriesDetailResponseSchema.parse({ series: detail });

  app.get('/admin/series', async () =>
    adminSeriesListResponseSchema.parse({ series: await series.list() }),
  );

  app.post('/admin/series', async (req, reply) => {
    const body = createSeriesRequestSchema.parse(req.body);
    return reply.code(201).send(seriesReply(await series.create(authOf(req).user, body)));
  });

  app.get('/admin/series/:id', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    return seriesReply(await series.get(id));
  });

  app.patch('/admin/series/:id', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const body = updateSeriesRequestSchema.parse(req.body);
    return seriesReply(await series.update(authOf(req).user, id, body));
  });

  app.delete('/admin/series/:id', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    await series.remove(authOf(req).user, id);
    return reply.code(204).send();
  });

  app.post('/admin/series/:id/reorder', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const body = reorderSeriesRequestSchema.parse(req.body);
    return seriesReply(await series.reorder(authOf(req).user, id, body.episodeIds));
  });

  app.post('/admin/series/:id/cover', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const detail = await series.setCover(authOf(req).user, id, await readCover(req));
    return reply.code(202).send(seriesReply(detail));
  });

  // ---- playlists (incl. Онцлох) ----
  const playlistReply = (detail: Awaited<ReturnType<PlaylistService['get']>>) =>
    adminPlaylistDetailResponseSchema.parse({ playlist: detail });

  app.get('/admin/playlists', async () =>
    adminPlaylistListResponseSchema.parse({ playlists: await playlists.list() }),
  );

  app.post('/admin/playlists', async (req, reply) => {
    const body = createPlaylistRequestSchema.parse(req.body);
    return reply.code(201).send(playlistReply(await playlists.create(authOf(req).user, body)));
  });

  app.post('/admin/playlists/home-order', async (req) => {
    const body = reorderHomeRequestSchema.parse(req.body);
    return adminPlaylistListResponseSchema.parse({
      playlists: await playlists.reorderHome(authOf(req).user, body.playlistIds),
    });
  });

  app.get('/admin/playlists/:id', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    return playlistReply(await playlists.get(id));
  });

  app.patch('/admin/playlists/:id', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const body = updatePlaylistRequestSchema.parse(req.body);
    return playlistReply(await playlists.update(authOf(req).user, id, body));
  });

  app.delete('/admin/playlists/:id', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    await playlists.remove(authOf(req).user, id);
    return reply.code(204).send();
  });

  app.post('/admin/playlists/:id/items', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const body = playlistItemsRequestSchema.parse(req.body);
    return playlistReply(await playlists.addItems(authOf(req).user, id, body.episodeIds));
  });

  app.delete('/admin/playlists/:id/items/:episodeId', async (req) => {
    const { id, episodeId } = playlistItemParamsSchema.parse(req.params);
    return playlistReply(await playlists.removeItem(authOf(req).user, id, episodeId));
  });

  app.post('/admin/playlists/:id/reorder', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const body = reorderPlaylistRequestSchema.parse(req.body);
    return playlistReply(await playlists.reorder(authOf(req).user, id, body.episodeIds));
  });

  app.post('/admin/playlists/:id/cover', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const detail = await playlists.setCover(authOf(req).user, id, await readCover(req));
    return reply.code(202).send(playlistReply(detail));
  });

  // ---- episodes ----
  app.get('/admin/episodes', async (req) =>
    adminEpisodesPageSchema.parse(
      await content.listEpisodes(listAdminEpisodesQuerySchema.parse(req.query)),
    ),
  );

  app.post('/admin/episodes', async (req, reply) => {
    const body = createEpisodeRequestSchema.parse(req.body);
    const episode = await content.createEpisode(authOf(req).user, body);
    return reply.code(201).send(adminEpisodeResponseSchema.parse({ episode }));
  });

  app.post('/admin/episodes/bulk', async (req) => {
    const body = bulkRequestSchema.parse(req.body);
    return bulkResponseSchema.parse(await bulk.run(authOf(req).user, body.ids, body.action));
  });

  app.post('/admin/episodes/:id/duplicate', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const episode = await content.duplicate(authOf(req).user, id);
    return reply.code(201).send(adminEpisodeResponseSchema.parse({ episode }));
  });

  app.post('/admin/episodes/:id/preview', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const preview = previewResponseSchema.parse(await content.preview(id));
    return reply.header('cache-control', 'no-store').send(preview);
  });

  app.get('/admin/episodes/:id', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    return adminEpisodeResponseSchema.parse({ episode: await content.getEpisode(id) });
  });

  app.patch('/admin/episodes/:id', async (req) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const body = updateEpisodeRequestSchema.parse(req.body);
    return adminEpisodeResponseSchema.parse({
      episode: await content.updateEpisode(authOf(req).user, id, body),
    });
  });

  app.delete('/admin/episodes/:id', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    await content.deleteEpisode(authOf(req).user, id);
    return reply.code(204).send();
  });

  app.post('/admin/episodes/:id/cover', async (req, reply) => {
    const { id } = contentIdParamsSchema.parse(req.params);
    const episode = await content.setCover(authOf(req).user, id, await readCover(req));
    return reply.code(202).send(adminEpisodeResponseSchema.parse({ episode }));
  });

  const transition =
    (run: (req: FastifyRequest, id: string) => ReturnType<ContentService['getEpisode']>) =>
    async (req: FastifyRequest) => {
      const { id } = contentIdParamsSchema.parse(req.params);
      return adminEpisodeResponseSchema.parse({ episode: await run(req, id) });
    };
  app.post(
    '/admin/episodes/:id/publish',
    transition((req, id) => content.publish(authOf(req).user, id)),
  );
  app.post(
    '/admin/episodes/:id/schedule',
    transition((req, id) =>
      content.schedule(
        authOf(req).user,
        id,
        new Date(scheduleRequestSchema.parse(req.body).scheduledFor),
      ),
    ),
  );
  app.post(
    '/admin/episodes/:id/unschedule',
    transition((req, id) => content.unschedule(authOf(req).user, id)),
  );
  app.post(
    '/admin/episodes/:id/archive',
    transition((req, id) => content.archive(authOf(req).user, id)),
  );
  app.post(
    '/admin/episodes/:id/restore',
    transition((req, id) => content.restore(authOf(req).user, id)),
  );
  app.post(
    '/admin/episodes/:id/media/retry',
    transition((req, id) => content.retryMedia(authOf(req).user, id)),
  );

  // ---- a user's devices ----
  app.delete('/admin/users/:id/devices/:deviceId', async (req, reply) => {
    const { id, deviceId } = removeDeviceParamsSchema.parse(req.params);
    await content.removeDevice(authOf(req).user, id, deviceId);
    return reply.code(204).send();
  });

  // ---- resumable audio upload (tus) ----
  const handleTus = async (req: FastifyRequest, reply: FastifyReply) => {
    // Set after the guard, overriding anything the client sent: who is uploading.
    const raw = req.raw;
    for (let i = raw.rawHeaders.length - 2; i >= 0; i -= 2) {
      if (raw.rawHeaders[i]!.toLowerCase() === ADMIN_HEADER) raw.rawHeaders.splice(i, 2);
    }
    // The tus server builds its Request from rawHeaders, so both views must carry it.
    raw.rawHeaders.push(ADMIN_HEADER, authOf(req).user.id);
    raw.headers[ADMIN_HEADER] = authOf(req).user.id;
    reply.hijack();
    await tus.server.handle(req.raw, reply.raw);
  };
  app.all('/admin/uploads', handleTus);
  app.all('/admin/uploads/*', handleTus);
}
