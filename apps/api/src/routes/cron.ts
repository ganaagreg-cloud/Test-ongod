import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CronTask } from '../cron/tasks';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { JobWorker } from '../jobs/worker';

const headersSchema = z.object({ 'x-cron-secret': z.string().min(1) });

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time comparison (hashing first makes the lengths equal). */
const secretMatches = (given: string, expected: string) =>
  timingSafeEqual(sha256(given), sha256(expected));

export interface CronRouteOptions {
  db: Db;
  secret: string;
  tasks: CronTask[];
  /** Also processes due jobs, for hosts that idle the process between requests. */
  worker?: JobWorker;
  jobBudgetMs?: number;
}

export async function cronRoutes(app: FastifyInstance, opts: CronRouteOptions) {
  // Cron services often POST form or empty bodies; the body is never read, so accept anything.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', (_req, _payload, done) => done(null));

  app.post('/cron/tick', async (req) => {
    const headers = headersSchema.safeParse(req.headers);
    if (!headers.success || !secretMatches(headers.data['x-cron-secret'], opts.secret)) {
      throw new AppError(401, 'UNAUTHORIZED');
    }

    const now = new Date();
    const tasks: Record<string, { affected: number } | { error: true }> = {};
    for (const task of opts.tasks) {
      try {
        tasks[task.name] = await task.run({ db: opts.db, now });
      } catch (err) {
        req.log.error({ err, task: task.name }, 'cron task failed');
        tasks[task.name] = { error: true };
      }
    }

    const jobsProcessed = opts.worker ? await opts.worker.drain(opts.jobBudgetMs ?? 20_000) : 0;
    return { tasks, jobsProcessed };
  });
}
