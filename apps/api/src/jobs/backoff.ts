export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
}

export const defaultBackoff: BackoffOptions = { baseMs: 30_000, maxMs: 6 * 60 * 60_000 };

/** Delay before retry number `attempt` (1-based): base, 2×base, 4×base, … capped at max. */
export function backoffMs(attempt: number, { baseMs, maxMs }: BackoffOptions = defaultBackoff) {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
