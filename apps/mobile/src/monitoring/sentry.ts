import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';
import { env } from '../config/env';

/**
 * Crash and error reports (ADR-0016: Sentry is optional and only on when a DSN is set).
 * Reports carry no personal data: no default PII, and the user is identified by id only.
 * Passwords never reach Sentry: requests are not recorded with bodies.
 */
export const monitoringEnabled = env.sentryDsn !== undefined;

export function initMonitoring() {
  if (!env.sentryDsn) return;
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    sendDefaultPii: false,
    // Errors only for now; performance tracing can be turned on later without a rebuild.
    tracesSampleRate: 0,
  });
}

/** Wraps the root component so navigation and render errors are captured. */
export function wrapRoot<P extends Record<string, unknown>>(
  Root: ComponentType<P>,
): ComponentType<P> {
  return monitoringEnabled ? Sentry.wrap(Root) : Root;
}

export function reportError(error: unknown) {
  if (monitoringEnabled) Sentry.captureException(error);
}

export function setMonitoringUser(id: string | null) {
  if (monitoringEnabled) Sentry.setUser(id ? { id } : null);
}
