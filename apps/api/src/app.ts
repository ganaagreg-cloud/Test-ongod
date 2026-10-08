import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyError } from 'fastify';
import { cronTasks, type CronTask } from './cron/tasks';
import type { Db } from './db';
import type { Env } from './env';
import { errorBody, toErrorReply } from './errors';
import { mn } from './i18n/mn';
import type { JobWorker } from './jobs/worker';
import { createLogger, type Logger } from './logger';
import { cronRoutes } from './routes/cron';
import { appConfigRoutes, healthRoutes } from './routes/system';
import type { Reporter } from './sentry';
import { defaultStaticDirs, registerStatic } from './static';

export interface AppDeps {
  env: Env;
  db: Db;
  logger?: Logger;
  worker?: JobWorker;
  report?: Reporter;
  cronTasks?: CronTask[];
  staticDirs?: { portal: string; admin: string };
}

const REQUEST_ID = /^[\w-]{1,64}$/;

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
