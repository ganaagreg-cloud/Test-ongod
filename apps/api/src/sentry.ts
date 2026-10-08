import * as Sentry from '@sentry/node';
import type { Env } from './env';

export type Reporter = (err: unknown) => void;

/** Initializes Sentry only when SENTRY_DSN is set. Returns an error reporter (or undefined). */
export function initSentry(env: Env): Reporter | undefined {
  if (!env.SENTRY_DSN) return undefined;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    // Errors only for now; no performance tracing.
    tracesSampleRate: 0,
  });
  return (err) => Sentry.captureException(err);
}

export const flushSentry = (timeoutMs = 2000) => Sentry.close(timeoutMs);
