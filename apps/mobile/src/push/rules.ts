/**
 * Push registration rules (ADR-0055), kept free of native modules so they can be tested.
 */

export interface PushRuntime {
  os: string;
  /** False on simulators and emulators: they have no push token. */
  isDevice: boolean;
  isExpoGo: boolean;
  /** The EAS project id baked into the build (EAS_PROJECT_ID). */
  projectId: string | undefined;
}

/** Push works only in a development or store build on a real phone with an EAS project. */
export function pushAvailable(rt: PushRuntime): boolean {
  return (rt.os === 'ios' || rt.os === 'android') && rt.isDevice && !rt.isExpoGo && !!rt.projectId;
}

export interface PermissionState {
  granted: boolean;
  /** 'granted', 'denied' or 'undetermined' (the system has never asked). */
  status: string;
  canAskAgain: boolean;
}

/**
 * What to do. On a signed-in `start` the system prompt shows only if it has never been shown
 * (no nagging after a "no"). The Профайл `switch` asks again when the system allows it, and
 * otherwise reports `blocked` so the screen can open the system settings.
 */
export function nextStep(
  permission: PermissionState,
  opts: { optedOut: boolean; trigger: 'start' | 'switch' },
): 'register' | 'ask' | 'blocked' | 'skip' {
  if (opts.optedOut) return 'skip';
  if (permission.granted) return 'register';
  if (opts.trigger === 'start') return permission.status === 'undetermined' ? 'ask' : 'skip';
  return permission.canAskAgain ? 'ask' : 'blocked';
}

/** The episode a push points at (the API sends `{ episodeId }` for one new episode). */
export function episodeIdOf(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const id = (data as Record<string, unknown>).episodeId;
  return typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : undefined;
}
