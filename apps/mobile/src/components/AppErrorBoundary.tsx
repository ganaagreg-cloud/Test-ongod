import { useEffect } from 'react';
import { mn } from '../i18n/mn';
import { reportError } from '../monitoring/sentry';
import { Button } from '../ui';
import { StatusView } from './StatusView';

/** expo-router shows this when a screen throws; the error goes to Sentry (if enabled). */
export function AppErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => reportError(error), [error]);
  return (
    <StatusView
      title={mn.gate.errorTitle}
      text={mn.gate.errorText}
      action={<Button label={mn.common.retry} onPress={() => void retry()} />}
    />
  );
}
