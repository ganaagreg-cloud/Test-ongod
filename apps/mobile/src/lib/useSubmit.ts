import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../api';
import { mn } from '../i18n/mn';
import { reportError } from '../monitoring/sentry';
import { useToast } from '../ui';

/**
 * Runs one form action: blocks a second tap while it is running, and shows what went wrong as a
 * toast. The server's own message (already Mongolian) is shown for API errors; anything else is
 * a bug, so it goes to Sentry and the user sees the general message.
 * Resolves to true when the action finished without an error.
 */
export function useSubmit() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const running = useRef(false);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      if (running.current) return false;
      running.current = true;
      setPending(true);
      try {
        await action();
        return true;
      } catch (error) {
        if (error instanceof ApiError) {
          toast.show(error.message, { tone: 'danger' });
        } else {
          reportError(error);
          toast.show(mn.errors.generic, { tone: 'danger' });
        }
        return false;
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [toast],
  );

  return { pending, run };
}
