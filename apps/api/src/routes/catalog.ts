import type { FastifyInstance } from 'fastify';
import {
  categoriesResponseSchema,
  episodeDetailResponseSchema,
  episodeIdParamsSchema,
  episodeParamsSchema,
  episodesPageSchema,
  homeResponseSchema,
  listEpisodesQuerySchema,
  listSavedQuerySchema,
  playResponseSchema,
  saveProgressRequestSchema,
} from '@ongod/shared';
import { authOf, type createAuthGuard } from '../auth/guard';
import type { CatalogService } from '../catalog/service';

/**
 * Catalog, playback, progress and saved (SPEC G). Every route needs a signed-in user with an
 * ACTIVE profile (the auth guard answers PROFILE_INCOMPLETE otherwise). Only playback needs
 * active access; the catalog is visible to every logged-in user.
 */
export async function catalogRoutes(
  app: FastifyInstance,
  opts: { catalog: CatalogService; requireAuth: ReturnType<typeof createAuthGuard> },
) {
  const { catalog } = opts;
  app.addHook('preHandler', opts.requireAuth);

  app.get('/categories', async () =>
    categoriesResponseSchema.parse({ categories: await catalog.categories() }),
  );

  app.get('/episodes', async (req) => {
    const query = listEpisodesQuerySchema.parse(req.query);
    return episodesPageSchema.parse(await catalog.listEpisodes(authOf(req).user.id, query));
  });

  app.get('/episodes/:id', async (req) => {
    const { id } = episodeParamsSchema.parse(req.params);
    return episodeDetailResponseSchema.parse({
      episode: await catalog.episodeDetail(authOf(req).user.id, id),
    });
  });

  app.get('/home', async (req) =>
    homeResponseSchema.parse(await catalog.home(authOf(req).user.id)),
  );

  app.post('/episodes/:id/play', async (req, reply) => {
    const { id } = episodeParamsSchema.parse(req.params);
    // The URL is a bearer credential: it must not be cached by a proxy or the client.
    reply.header('cache-control', 'no-store');
    return playResponseSchema.parse(await catalog.play(authOf(req), id));
  });

  app.put('/progress/:episodeId', async (req, reply) => {
    const { episodeId } = episodeIdParamsSchema.parse(req.params);
    const body = saveProgressRequestSchema.parse(req.body);
    await catalog.saveProgress(authOf(req).user.id, episodeId, body);
    return reply.code(204).send();
  });

  app.put('/saved/:episodeId', async (req, reply) => {
    const { episodeId } = episodeIdParamsSchema.parse(req.params);
    await catalog.save(authOf(req).user.id, episodeId);
    return reply.code(204).send();
  });

  app.delete('/saved/:episodeId', async (req, reply) => {
    const { episodeId } = episodeIdParamsSchema.parse(req.params);
    await catalog.unsave(authOf(req).user.id, episodeId);
    return reply.code(204).send();
  });

  app.get('/saved', async (req) => {
    const query = listSavedQuerySchema.parse(req.query);
    return episodesPageSchema.parse(await catalog.listSaved(authOf(req).user.id, query));
  });
}
