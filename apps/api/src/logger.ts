import pino from 'pino';
import type { Env } from './env';

const redact = ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-cron-secret"]'];

type LoggerEnv = Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'> &
  Partial<Pick<Env, 'LOG_FILE' | 'LOG_FILE_MAX_SIZE' | 'LOG_FILE_COUNT'>>;

/**
 * One pino logger for Fastify (request logs carry reqId) and background work.
 * Always logs to stdout (Plesk shows it). With LOG_FILE set, also writes JSON lines to a
 * daily/size-rotated file, keeping the newest LOG_FILE_COUNT files.
 */
export function createLogger(env: LoggerEnv) {
  const level = env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL;
  if (!env.LOG_FILE || level === 'silent') return pino({ level, redact });

  const transport = pino.transport({
    targets: [
      { target: 'pino/file', level, options: { destination: 1 } },
      {
        target: 'pino-roll',
        level,
        options: {
          file: env.LOG_FILE,
          frequency: 'daily',
          dateFormat: 'yyyy-MM-dd',
          size: env.LOG_FILE_MAX_SIZE,
          mkdir: true,
          // Also remove files left by earlier processes, so restarts do not pile up logs.
          limit: { count: env.LOG_FILE_COUNT, removeOtherLogFiles: true },
        },
      },
    ],
  });
  return pino({ level, redact }, transport);
}

export type Logger = ReturnType<typeof createLogger>;
