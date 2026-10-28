// Web preview (Expo web): no push (ADR-0055). Same exports as push.ts, doing nothing.

export type PushResult = 'on' | 'off' | 'blocked' | 'unavailable';

export const pushIsAvailable = false;

export async function pushEnabled(): Promise<boolean> {
  return false;
}

export async function setPushEnabled(_on: boolean): Promise<PushResult> {
  return 'unavailable';
}

export function usePush() {}
