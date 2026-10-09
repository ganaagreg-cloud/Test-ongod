/** Parses "1.4.0" into [1, 4, 0]; anything else (including a missing value) gives undefined. */
export function parseVersion(
  value: string | null | undefined,
): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value ?? '');
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * True when `current` is older than `minimum` (SPEC I: below the minimum -> blocking screen).
 * An unreadable current version is treated as up to date: the app must not lock itself out
 * because of a build setup mistake (the server cannot tell the difference either).
 */
export function isBelowMinVersion(current: string | null | undefined, minimum: string): boolean {
  const have = parseVersion(current);
  const need = parseVersion(minimum);
  if (!have || !need) return false;
  for (let i = 0; i < 3; i++) {
    if (have[i]! !== need[i]!) return have[i]! < need[i]!;
  }
  return false;
}
