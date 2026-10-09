import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { ApiError } from '../api/client';
import { mn } from '../i18n/mn';

export interface AsyncState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  /** True while a request is running, including a `reload()`; old data stays available meanwhile. */
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  /** Which request this result belongs to. */
  tick: number;
  data?: T;
  error?: ApiError;
}

/** Loads data when the component mounts; `reload()` loads again. */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ tick: -1 });
  // The effect below must not restart just because `load` is a new function every render.
  const run = useEffectEvent((signal: AbortSignal) => load(signal));

  useEffect(() => {
    const controller = new AbortController();
    run(controller.signal)
      .then((data) => setSettled({ tick, data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSettled((previous) => ({
          tick,
          ...(previous.data !== undefined ? { data: previous.data } : {}),
          error:
            err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', mn.common.errorGeneric),
        }));
      });
    return () => controller.abort();
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data: settled.data, error: settled.error, loading: settled.tick !== tick, reload };
}
