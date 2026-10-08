import type { z } from 'zod';
import type { Db, Prisma } from '../db';
import type { JobDefinition } from './registry';

/** Either the client or a transaction client, so jobs can be enqueued atomically with a state change. */
export type JobWriter = Db | Prisma.TransactionClient;

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
}

/** Validates the payload with the job's schema and inserts a QUEUED job. */
export async function enqueue<S extends z.ZodType>(
  db: JobWriter,
  def: Pick<JobDefinition<S>, 'type' | 'schema' | 'maxAttempts'>,
  payload: z.input<S>,
  opts: EnqueueOptions = {},
) {
  const parsed = def.schema.parse(payload);
  return db.job.create({
    data: {
      type: def.type,
      payload: JSON.stringify(parsed),
      maxAttempts: opts.maxAttempts ?? def.maxAttempts ?? 5,
      ...(opts.runAt ? { runAt: opts.runAt } : {}),
    },
  });
}
