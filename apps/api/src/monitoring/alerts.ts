import { createHash } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import type { Mailer } from '../email/mailer';
import { renderEmail } from '../email/templates';
import type { Job } from '../generated/prisma/client';
import { enqueue } from '../jobs/queue';
import { defineJob } from '../jobs/registry';

export const ALERT_JOB_TYPE = 'alert.send';

const alertPayloadSchema = z.object({
  to: z.array(z.email()).min(1),
  /** Hash of the throttle key; searched in recent alert jobs to avoid repeats. */
  dedupe: z.string().regex(/^[0-9a-f]{24}$/),
  kind: z.enum(['http', 'job']),
  summary: z.string().max(1000),
  requestId: z.string().max(64).optional(),
  occurredAt: z.iso.datetime(),
  throttleMinutes: z.number().int().positive(),
});

const alertJobSpec = { type: ALERT_JOB_TYPE, schema: alertPayloadSchema, maxAttempts: 5 };

/** Sends the owner/admin alert email. */
export function createAlertJob(mailer: Mailer) {
  return defineJob({
    ...alertJobSpec,
    async handle({ to, kind, summary, requestId, occurredAt, throttleMinutes }) {
      await mailer.send(
        to.join(', '),
        renderEmail('errorAlert', { kind, summary, requestId, occurredAt, throttleMinutes }),
      );
    },
  });
}

export interface HttpErrorInfo {
  requestId: string;
  method: string;
  /** Route pattern (e.g. /v1/episodes/:id), never the raw URL, so no query data leaks. */
  route: string;
}

export interface Alerts {
  httpError(err: unknown, info: HttpErrorInfo): Promise<void>;
  jobFailed(err: unknown, job: Job): Promise<void>;
}

const describe = (err: unknown) =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);

/**
 * Emails ALERT_EMAILS about server errors and failed jobs, at most once per key per
 * throttle window. Never throws: monitoring must not break the request or the worker.
 */
export function createAlerts(opts: {
  db: Db;
  log: FastifyBaseLogger;
  to: string[];
  throttleMinutes: number;
  now?: () => Date;
}): Alerts {
  const now = opts.now ?? (() => new Date());
  const throttleMs = opts.throttleMinutes * 60_000;
  const lastSent = new Map<string, number>();

  async function notify(
    key: string,
    kind: 'http' | 'job',
    summary: string,
    requestId?: string,
  ): Promise<void> {
    if (opts.to.length === 0) return;
    const at = now();
    try {
      // Fast path: this process already alerted about this key recently.
      const previous = lastSent.get(key);
      if (previous !== undefined && at.getTime() - previous < throttleMs) return;
      lastSent.set(key, at.getTime());

      // Across restarts and processes: an alert job for this key in the window.
      const dedupe = createHash('sha256').update(key).digest('hex').slice(0, 24);
      const recent = await opts.db.job.findFirst({
        where: {
          type: ALERT_JOB_TYPE,
          runAt: { gt: new Date(at.getTime() - throttleMs) },
          payload: { contains: dedupe },
        },
        select: { id: true },
      });
      if (recent) return;

      await enqueue(opts.db, alertJobSpec, {
        to: opts.to,
        dedupe,
        kind,
        summary: summary.slice(0, 1000),
        requestId,
        occurredAt: at.toISOString(),
        throttleMinutes: opts.throttleMinutes,
      });
    } catch (err) {
      opts.log.warn({ err, alertKey: key }, 'could not queue alert email');
    }
  }

  return {
    httpError(err, { requestId, method, route }) {
      const name = err instanceof Error ? err.name : 'Error';
      return notify(
        `http:${method}:${route}:${name}`,
        'http',
        `${method} ${route}\n${describe(err)}`,
        requestId,
      );
    },
    jobFailed(err, job) {
      // A failing alert must not alert again (e.g. SMTP down would loop forever).
      if (job.type === ALERT_JOB_TYPE) return Promise.resolve();
      return notify(
        `job:${job.type}`,
        'job',
        `${job.type} (${job.id}), ${job.attempts}/${job.maxAttempts}\n${describe(err)}`,
      );
    },
  };
}
