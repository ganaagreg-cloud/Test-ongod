import { useEffect, useState } from 'react';

/** `value`, once it has stopped changing for `ms` (search as you type). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** True for `ms` after `key` changes: keeps a skeleton up long enough to read as a change. */
export function useHold(key: string, ms: number): boolean {
  const [released, setReleased] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setReleased(key), ms);
    return () => clearTimeout(timer);
  }, [key, ms]);
  return released !== key;
}
