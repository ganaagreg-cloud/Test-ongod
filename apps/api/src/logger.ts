import pino from 'pino';
import type { Env } from './env';

/** One pino logger for Fastify (request logs carry reqId) and background work. */
export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>) {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-cron-secret"]'],
  });
}

export type Logger = ReturnType<typeof createLogger>;
