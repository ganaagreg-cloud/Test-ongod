import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from 'fastify';
import { createDecisionService } from './admin/decisions';
import { createAdminGuards } from './admin/guard';
import { createContentService } from './admin/content';
import { createAdminQueries } from './admin/queries';
import { createTotpService } from './admin/totp';
import { createAuthGuard } from './auth/guard';
import { AuthLimiter } from './auth/rate-limit';
import { createAuthService } from './auth/service';
import { createWebSession } from './auth/web-session';
import { createSocialVerifiers, type SocialVerifiers } from './auth/social';
import { createSocialService } from './auth/social-service';
import { createMediaUrls, type MediaUrls } from './catalog/media';
import { createCatalogService } from './catalog/service';
import { cleanupAbandonedUploads, cronTasks, type CronTask } from './cron/tasks';
import type { Db } from './db';
import { missingBunnyKeys, requireBunny, type Env } from './env';
import { errorBody, toErrorReply, type HttpErrorReporter } from './errors';
import { mn } from './i18n/mn';
import type { JobWorker } from './jobs/worker';
import { createBunnySigner } from './lib/bunnyToken';
import { createLogger, type Logger } from './logger';
import { createMediaRuntime, type MediaRuntime } from './media/storage';
import { createTusServer } from './media/tus';
import { createReceiptStore, type ReceiptStore } from './subscriptions/receipts';
import { createSubscriptionService } from './subscriptions/service';
import { adminRoutes } from './routes/admin';
import { adminContentRoutes } from './routes/admin-content';
import { authRoutes } from './routes/auth';
import { catalogRoutes } from './routes/catalog';
import { cronRoutes } from './routes/cron';
import { meRoutes } from './routes/me';
import { socialRoutes } from './routes/social';
import { subscriptionRoutes } from './routes/subscriptions';
import { appConfigRoutes, healthRoutes } from './routes/system';
import { defaultStaticDirs, registerStatic } from './static';

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
  /** Private store for payment receipt images; defaults to RECEIPTS_DIR on disk. */
  receipts?: ReceiptStore;
  /** Clock for the catalog and subscriptions (visibility, play expiry, periods); tests pass a fixed one. */
  now?: () => Date;
}

const REQUEST_ID = /^[\w-]{1,64}$/;

/** Signed-URL maker from the BUNNY_* env; without them covers are null and playback is a 503. */
function mediaFromEnv(env: Env): MediaUrls {
  if (missingBunnyKeys(env).length > 0) return createMediaUrls(undefined);
  const bunny = requireBunny(env);
  return createMediaUrls(createBunnySigner({ host: bunny.pullZoneHost, tokenKey: bunny.tokenKey }));
}

/** Number of proxy hops to trust (audit C-02): the host's proxy is one hop. */
const trustProxyHops = (trust: boolean): false | ((address: string, hop: number) => boolean) =>
  // proxy-addr's own "number" mode is `hop < n`; the Fastify types only accept the function form.
  trust ? (_address, hop) => hop < 1 : false;

export async function buildApp(deps: AppDeps) {
  const { env, db } = deps;

  const app = Fastify({
    loggerInstance: (deps.logger ?? createLogger(env)) as FastifyBaseLogger,
    // One proxy hop (the host's): the left-most X-Forwarded-For entry is client-controlled (audit C-02).
    trustProxy: trustProxyHops(env.TRUST_PROXY),
    // Reuse a sane incoming X-Request-Id (from a proxy), otherwise generate one.
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  // Admin shows signed Bunny cover images, so the pull zone host is allowed as an image source.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': [
          "'self'",
          'data:',
          ...(env.BUNNY_PULL_ZONE_HOST ? [`https://${env.BUNNY_PULL_ZONE_HOST}`] : []),
        ],
      },
    },
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // Static files (portal, admin) and /health are not API calls; counting them used up the
    // budget of everyone behind one carrier IP (audit C-01).
    allowList: (req) => req.url === '/health' || !req.url.startsWith('/v1'),
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
      const receipts = deps.receipts ?? createReceiptStore(env.RECEIPTS_DIR);
      const mediaRuntime = deps.mediaRuntime ?? createMediaRuntime(env);
      const tus = createTusServer({ db, dirs: mediaRuntime.dirs, env });
      await v1.register(subscriptionRoutes, {
        subscriptions: createSubscriptionService({ db, env, receipts, now: deps.now }),
        requireAuth,
      });
      await v1.register(adminRoutes, {
        guards: createAdminGuards(requireAuth),
        totp: createTotpService({ db, env, now: deps.now }),
        decisions: createDecisionService({ db, now: deps.now }),
        queries: createAdminQueries({ db, receipts, now: deps.now }),
        limiter,
      });
      await v1.register(adminContentRoutes, {
        guards: createAdminGuards(requireAuth),
        content: createContentService({
          db,
          media: mediaUrls,
          dirs: mediaRuntime.dirs,
          now: deps.now,
        }),
        tus,
      });
      await v1.register(appConfigRoutes, { db, socialLogin: env.SOCIAL_LOGIN });
      await v1.register(cronRoutes, {
        db,
        secret: env.CRON_SECRET,
        tasks: deps.cronTasks ?? [
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
