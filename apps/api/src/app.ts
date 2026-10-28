import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from 'fastify';
import { createDecisionService } from './admin/decisions';
import { createAdminGuards } from './admin/guard';
import { createBulkService } from './admin/bulk';
import { createContentService } from './admin/content';
import { createPlaylistService } from './admin/playlists';
import { createSeriesService } from './admin/series';
import { createTagService } from './admin/tags';
import { createAdminQueries } from './admin/queries';
import { createAuthGuard } from './auth/guard';
import { AuthLimiter } from './auth/rate-limit';
import { createAuthService } from './auth/service';
import { createWebSession } from './auth/web-session';
import { createSocialVerifiers, type SocialVerifiers } from './auth/social';
import { createSocialService } from './auth/social-service';
import { createMediaUrls, type MediaUrls } from './catalog/media';
import { createCatalogService } from './catalog/service';
import {
  cleanupAbandonedUploads,
  cronTasks,
  syncWaitingPayments,
  type CronTask,
} from './cron/tasks';
import type { Db } from './db';
import { missingBunnyKeys, missingStreamKeys, requireBunny, requireStream, type Env } from './env';
import { errorBody, toErrorReply, type HttpErrorReporter } from './errors';
import { mn } from './i18n/mn';
import type { JobWorker } from './jobs/worker';
import { createBunnySigner } from './lib/bunnyToken';
import { createLogger, type Logger } from './logger';
import { createMediaRuntime, type MediaRuntime } from './media/storage';
import { createTusServer } from './media/tus';
import { createPaymentService } from './payments/service';
import { createWireGateway, type WireGateway } from './payments/wire';
import { createSubscriptionService } from './subscriptions/service';
import { adminRoutes } from './routes/admin';
import { adminContentRoutes } from './routes/admin-content';
import { authRoutes } from './routes/auth';
import { catalogRoutes } from './routes/catalog';
import { cronRoutes } from './routes/cron';
import { meRoutes } from './routes/me';
import { socialRoutes } from './routes/social';
import { subscriptionRoutes } from './routes/subscriptions';
import { webhookRoutes } from './routes/webhooks';
import { appConfigRoutes, healthRoutes } from './routes/system';
import { defaultStaticDirs, isApiPath, registerStatic } from './static';

export interface AppDeps {
  env: Env;
  db: Db;
  logger?: Logger;
  worker?: JobWorker;
  /** Unexpected (5xx) request errors. */
  report?: HttpErrorReporter;
  cronTasks?: CronTask[];
  staticDirs?: { portal: string; admin: string };
  /** Google/Apple ID-token verifiers; tests pass fakes. Only used when SOCIAL_LOGIN is on. */
  socialVerifiers?: SocialVerifiers;
  /** Signed Bunny URLs; built from env by default. Tests can pass a stub. */
  media?: MediaUrls;
  /**
   * Dev only: registers the API docs. Called before any route is added, because swagger
   * collects routes as they are registered. Production never passes it (see dev/docs.ts).
   */
  registerDocs?: (app: FastifyInstance) => Promise<void>;
  /** Storage and working folders for media (covers, audio); built from env by default. Tests pass a local one. */
  mediaRuntime?: MediaRuntime;
  /** Wire payment gateway (QPay); built from WIRE_API_KEY by default, null = mock checkout. Tests pass a fake. */
  wire?: WireGateway | null;
  /** Clock for the catalog and subscriptions (visibility, play expiry, periods); tests pass a fixed one. */
  now?: () => Date;
}

const REQUEST_ID = /^[\w-]{1,64}$/;

/**
 * Signed-URL maker from the BUNNY_* env; without them covers are null and playback is a 503.
 * Video needs the BUNNY_STREAM_* settings too (ADR-0038).
 */
function mediaFromEnv(env: Env): MediaUrls {
  if (missingBunnyKeys(env).length > 0) return createMediaUrls(undefined);
  const bunny = requireBunny(env);
  const signer = createBunnySigner({ host: bunny.pullZoneHost, tokenKey: bunny.tokenKey });
  if (missingStreamKeys(env).length > 0) return createMediaUrls(signer);
  const stream = requireStream(env);
  return createMediaUrls(
    signer,
    createBunnySigner({ host: stream.cdnHost, tokenKey: stream.tokenKey }),
  );
}

export async function buildApp(deps: AppDeps) {
  const { env, db } = deps;

  const app = Fastify({
    loggerInstance: (deps.logger ?? createLogger(env)) as FastifyBaseLogger,
    trustProxy: env.TRUST_PROXY,
    // Reuse a sane incoming X-Request-Id (from a proxy), otherwise generate one.
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // Only the API counts (ADR-0057): the portal and admin files are cheap and cached, and one
    // page load fetches several of them, which used up the limit and broke the session renewal.
    allowList: (req) => !isApiPath(req.url),
  });

  app.setErrorHandler<FastifyError>((err, req, reply) =>
    toErrorReply(err, req, reply, deps.report),
  );

  await deps.registerDocs?.(app);

  const spaFallback = env.SERVE_STATIC
    ? await registerStatic(app, deps.staticDirs ?? defaultStaticDirs)
    : undefined;

  app.setNotFoundHandler((req, reply) => {
    if (spaFallback?.(req, reply)) return;
    return reply.code(404).send(errorBody('NOT_FOUND', mn.errors.NOT_FOUND));
  });

  await app.register(healthRoutes, { db });
  await app.register(
    async (v1) => {
      const auth = createAuthService({ db, env });
      const limiter = new AuthLimiter({
        ipMax: env.AUTH_RATE_LIMIT_IP_MAX,
        identifierMax: env.AUTH_RATE_LIMIT_IDENTIFIER_MAX,
        identifierCeiling: env.AUTH_RATE_LIMIT_IDENTIFIER_CEILING,
        refreshDeviceMax: env.AUTH_REFRESH_DEVICE_MAX,
        windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      });
      await v1.register(authRoutes, { auth, limiter, webSession: createWebSession(env) });
      const requireAuth = createAuthGuard({ db, env });
      await v1.register(meRoutes, { auth, limiter, requireAuth });
      if (env.SOCIAL_LOGIN) {
        await v1.register(socialRoutes, {
          social: createSocialService({ db, auth }),
          verifiers: deps.socialVerifiers ?? createSocialVerifiers(env),
          limiter,
          requireAuth,
        });
      }
      const mediaUrls = deps.media ?? mediaFromEnv(env);
      await v1.register(catalogRoutes, {
        catalog: createCatalogService({ db, media: mediaUrls, now: deps.now }),
        requireAuth,
      });
      const mediaRuntime = deps.mediaRuntime ?? createMediaRuntime(env);
      const tus = createTusServer({ db, dirs: mediaRuntime.dirs, env });
      const payments = createPaymentService({
        db,
        env,
        gateway: deps.wire === undefined ? createWireGateway(env) : deps.wire,
        log: app.log,
        now: deps.now,
      });
      await v1.register(subscriptionRoutes, {
        subscriptions: createSubscriptionService({ db, payments, now: deps.now }),
        payments,
        requireAuth,
      });
      await v1.register(webhookRoutes, { payments });
      await v1.register(adminRoutes, {
        guards: createAdminGuards(requireAuth),
        decisions: createDecisionService({ db, now: deps.now }),
        queries: createAdminQueries({ db, now: deps.now }),
      });
      const contentService = createContentService({
        db,
        media: mediaUrls,
        dirs: mediaRuntime.dirs,
        now: deps.now,
      });
      const playlistService = createPlaylistService({
        db,
        media: mediaUrls,
        dirs: mediaRuntime.dirs,
        now: deps.now,
      });
      await v1.register(adminContentRoutes, {
        guards: createAdminGuards(requireAuth),
        content: contentService,
        tags: createTagService({ db }),
        series: createSeriesService({
          db,
          media: mediaUrls,
          dirs: mediaRuntime.dirs,
          now: deps.now,
        }),
        playlists: playlistService,
        bulk: createBulkService({
          db,
          content: contentService,
          playlists: playlistService,
          now: deps.now,
        }),
        tus,
      });
      await v1.register(appConfigRoutes, { db, socialLogin: env.SOCIAL_LOGIN });
      await v1.register(cronRoutes, {
        db,
        secret: env.CRON_SECRET,
        tasks: deps.cronTasks ?? [
          // First, so a request about to expire is synced before expirePendingPayments runs.
          syncWaitingPayments(payments, { budgetMs: env.WIRE_SYNC_BUDGET_MS }),
          ...cronTasks,
          cleanupAbandonedUploads(() => tus.cleanUpExpired()),
        ],
        worker: deps.worker,
      });
    },
    { prefix: '/v1' },
  );

  return app;
}
