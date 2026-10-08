import { buildApp } from './app';
import { createDb } from './db';
import { createSmtpMailer } from './email/mailer';
import { loadEnvOrExit } from './env';
import { createJobRegistry } from './jobs';
import { JobWorker } from './jobs/worker';
import { createLogger } from './logger';
import { flushSentry, initSentry } from './sentry';

const env = loadEnvOrExit();
const report = initSentry(env);
const logger = createLogger(env);
const db = createDb(env.DATABASE_URL);

// Created even when the loop is disabled, so /v1/cron/tick can still drain jobs.
const worker = new JobWorker(
  db,
  createJobRegistry({ mailer: createSmtpMailer(env) }),
  logger.child({ component: 'jobs' }),
  { pollIntervalMs: env.JOB_POLL_INTERVAL_MS, report },
);

const app = await buildApp({ env, db, logger, worker, report });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await worker.stop();
  await db.$disconnect();
  if (report) await flushSentry();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  if (env.JOB_WORKER_ENABLED) worker.start();
} catch (err) {
  app.log.error({ err }, 'failed to start');
  report?.(err);
  process.exit(1);
}
