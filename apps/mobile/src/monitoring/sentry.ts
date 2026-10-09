import type * as SentryNamespace from '@sentry/react-native';
import type { ComponentType } from 'react';
import { env } from '../config/env';
import { isExpoGo } from '../lib/expoGo';

/**
 * Crash and error reports (ADR-0016: Sentry is optional and only on when a DSN is set).
 * Reports carry no personal data: no default PII, and the user is identified by id only.
 * Passwords never reach Sentry: requests are not recorded with bodies.
 *
 * In Expo Go (preview only, ADR-0033) the native SDK is never loaded; errors go to the console.
 */
export const monitoringEnabled = env.sentryDsn !== undefined && !isExpoGo;

type SentryModule = typeof SentryNamespace;
let sentry: SentryModule | undefined;
function getSentry(): SentryModule {
  // Required lazily so Expo Go never loads the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sentry ??= require('@sentry/react-native') as SentryModule;
  return sentry;
}

export function initMonitoring() {
  if (!monitoringEnabled || !env.sentryDsn) return;
  getSentry().init({
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
  return monitoringEnabled ? getSentry().wrap(Root) : Root;
}

export function reportError(error: unknown) {
  if (monitoringEnabled) getSentry().captureException(error);
  else if (isExpoGo) console.warn('[expo-go] error:', error);
}

export function setMonitoringUser(id: string | null) {
  if (monitoringEnabled) getSentry().setUser(id ? { id } : null);
}
