import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import type { Db } from '../db';

export interface JobContext {
  db: Db;
  log: FastifyBaseLogger;
  jobId: string;
  attempt: number;
}

export interface GiveUpContext extends JobContext {
  /** 'failed': attempts used up or a permanent error. 'lock-timeout': its worker stopped. */
  reason: 'failed' | 'lock-timeout';
}

export interface JobDefinition<S extends z.ZodType = z.ZodType> {
  type: string;
  schema: S;
  /** Defaults to 5. */
  maxAttempts?: number;
  handle(payload: z.infer<S>, ctx: JobContext): Promise<void>;
  /**
   * Runs once when the job ends FAILED for good: attempts used up, a permanent error, or failed
   * by lock-timeout recovery (ADR-0045), e.g. to mark the media it was processing FAILED. Never
   * on a failure that will still be retried. Best-effort: an error is logged and ignored.
   */
  onGiveUp?(payload: z.infer<S>, ctx: GiveUpContext): Promise<void>;
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
