import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyError } from 'fastify';
import { createAuthGuard } from './auth/guard';
import { AuthLimiter } from './auth/rate-limit';
import { createAuthService } from './auth/service';
import { createSocialVerifiers, type SocialVerifiers } from './auth/social';
import { createSocialService } from './auth/social-service';
import { createMediaUrls, type MediaUrls } from './catalog/media';
import { createCatalogService } from './catalog/service';
import { cronTasks, type CronTask } from './cron/tasks';
import type { Db } from './db';
import { missingBunnyKeys, requireBunny, type Env } from './env';
import { errorBody, toErrorReply, type HttpErrorReporter } from './errors';
import { mn } from './i18n/mn';
import type { JobWorker } from './jobs/worker';
import { createBunnySigner } from './lib/bunnyToken';
import { createLogger, type Logger } from './logger';
import { authRoutes } from './routes/auth';
import { catalogRoutes } from './routes/catalog';
import { cronRoutes } from './routes/cron';
import { meRoutes } from './routes/me';
import { socialRoutes } from './routes/social';
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
  /** Clock for the catalog (visibility, "this week", play expiry); tests pass a fixed one. */
  now?: () => Date;
}

const REQUEST_ID = /^[\w-]{1,64}$/;

/** Signed-URL maker from the BUNNY_* env; without them covers are null and playback is a 503. */
function mediaFromEnv(env: Env): MediaUrls {
  if (missingBunnyKeys(env).length > 0) return createMediaUrls(undefined);
  const bunny = requireBunny(env);
  return createMediaUrls(createBunnySigner({ host: bunny.pullZoneHost, tokenKey: bunny.tokenKey }));
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
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  app.setErrorHandler<FastifyError>((err, req, reply) =>
    toErrorReply(err, req, reply, deps.report),
  );

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
      await v1.register(authRoutes, { auth, limiter });
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
      await v1.register(catalogRoutes, {
        catalog: createCatalogService({
          db,
          media: deps.media ?? mediaFromEnv(env),
          now: deps.now,
        }),
        requireAuth,
      });
      await v1.register(appConfigRoutes, { db, socialLogin: env.SOCIAL_LOGIN });
      await v1.register(cronRoutes, {
        db,
        secret: env.CRON_SECRET,
        tasks: deps.cronTasks ?? cronTasks,
        worker: deps.worker,
      });
    },
    { prefix: '/v1' },
  );

  return app;
}
