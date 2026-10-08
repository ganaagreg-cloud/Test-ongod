import type { FastifyInstance } from 'fastify';
import { appConfigKeys, appConfigResponseSchema, type AppConfigResponse } from '@ongod/shared';
import type { Db } from '../db';
import { AppError } from '../errors';

const HEALTH_TIMEOUT_MS = 3000;

/** GET /health: process is up and the database answers. Outside /v1 for uptime monitors. */
export async function healthRoutes(app: FastifyInstance, opts: { db: Db }) {
  app.get('/health', async (req, reply) => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        opts.db.appConfig.findFirst({ select: { key: true } }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('database ping timed out')), HEALTH_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      req.log.error({ err }, 'health check: database unreachable');
      throw new AppError(503, 'SERVICE_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
    reply.header('cache-control', 'no-store');
    return { status: 'ok' };
  });
}

/** GET /v1/app-config: public config the mobile app reads on start (SPEC I). */
export async function appConfigRoutes(
  app: FastifyInstance,
  opts: { db: Db; socialLogin: boolean },
) {
  app.get('/app-config', async (_req, reply): Promise<AppConfigResponse> => {
    const rows = await opts.db.appConfig.findMany({
      where: { key: { in: Object.values(appConfigKeys) } },
    });
    const value = (key: string) => rows.find((r) => r.key === key)?.value ?? '0.0.0';

    reply.header('cache-control', 'public, max-age=60');
    // parse() strips anything not in the schema, so nothing else can leak to the app.
    return appConfigResponseSchema.parse({
      minVersion: {
        ios: value(appConfigKeys.minVersionIos),
        android: value(appConfigKeys.minVersionAndroid),
      },
      socialLogin: opts.socialLogin,
    });
  });
}
