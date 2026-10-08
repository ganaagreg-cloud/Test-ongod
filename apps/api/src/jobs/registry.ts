import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import type { Db } from '../db';

export interface JobContext {
  db: Db;
  log: FastifyBaseLogger;
  jobId: string;
  attempt: number;
}

export interface JobDefinition<S extends z.ZodType = z.ZodType> {
  type: string;
  schema: S;
  /** Defaults to 5. */
  maxAttempts?: number;
  handle(payload: z.infer<S>, ctx: JobContext): Promise<void>;
}

/** Identity helper that keeps the payload type tied to the schema. */
export const defineJob = <S extends z.ZodType>(def: JobDefinition<S>) => def;

/** Throw from a handler to fail the job immediately, without retries. */
export class PermanentJobError extends Error {}

export class JobRegistry {
  private readonly defs = new Map<string, JobDefinition>();

  register(...defs: JobDefinition[]): this {
    for (const def of defs) {
      if (this.defs.has(def.type)) throw new Error(`Job type already registered: ${def.type}`);
      this.defs.set(def.type, def);
    }
    return this;
  }

  get(type: string): JobDefinition | undefined {
    return this.defs.get(type);
  }
}
