import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  adminCategoriesResponseSchema,
  adminCategoryResponseSchema,
  adminEpisodeResponseSchema,
  adminEpisodesPageSchema,
  contentIdParamsSchema,
  createCategoryRequestSchema,
  createEpisodeRequestSchema,
  listAdminEpisodesQuerySchema,
  MAX_COVER_BYTES,
  removeDeviceParamsSchema,
  reorderCategoriesRequestSchema,
  scheduleRequestSchema,
  updateCategoryRequestSchema,
  updateEpisodeRequestSchema,
} from '@ongod/shared';
import type { AdminGuards } from '../admin/guard';
import type { ContentService } from '../admin/content';
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
 * ADMIN/OWNER session that passed TOTP.
 */
export async function adminContentRoutes(
  app: FastifyInstance,
  opts: { guards: AdminGuards; content: ContentService; tus: TusUploads },
) {
  const { content, tus } = opts;
  app.addHook('preHandler', opts.guards.requireAdminTotp);
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
  const handleTus = async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
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
