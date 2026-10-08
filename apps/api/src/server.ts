import { buildApp } from './app';
import { createDb } from './db';
import { createSmtpMailer } from './email/mailer';
import { loadEnvOrExit } from './env';
import { createJobRegistry } from './jobs';
import { JobWorker } from './jobs/worker';
import { createLogger } from './logger';
import { createAlerts } from './monitoring/alerts';
import { flushSentry, initSentry } from './sentry';

const env = loadEnvOrExit();
const sentry = initSentry(env);
const logger = createLogger(env);
const db = createDb(env.DATABASE_URL);
const alerts = createAlerts({
  db,
  log: logger.child({ component: 'alerts' }),
  to: env.ALERT_EMAILS,
  throttleMinutes: env.ALERT_THROTTLE_MINUTES,
});

// Created even when the loop is disabled, so /v1/cron/tick can still drain jobs.
const worker = new JobWorker(
  db,
  createJobRegistry({ mailer: createSmtpMailer(env) }),
  logger.child({ component: 'jobs' }),
  {
    pollIntervalMs: env.JOB_POLL_INTERVAL_MS,
    report: (err, job) => {
      sentry?.(err);
      void alerts.jobFailed(err, job);
    },
  },
);

const app = await buildApp({
  env,
  db,
  logger,
  worker,
  report: (err, info) => {
    sentry?.(err);
    void alerts.httpError(err, info);
  },
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await worker.stop();
  await db.$disconnect();
  if (sentry) await flushSentry();
  logger.flush();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  if (env.JOB_WORKER_ENABLED) worker.start();
} catch (err) {
  app.log.error({ err }, 'failed to start');
  sentry?.(err);
  process.exit(1);
}
