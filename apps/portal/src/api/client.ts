import { errorResponseSchema, tokenPairSchema } from '@ongod/shared';
import type { z } from 'zod';
import { mn } from '../i18n/mn';

/**
 * Talks to the API (same origin: Vite proxies /v1 in development, one process serves both in
 * production). Session handling (ADR-0026):
 * - the access token lives only in this module's memory, never in web storage;
 * - the refresh token is an httpOnly cookie that scripts cannot read; the browser sends it to
 *   /v1/auth/refresh by itself;
 * - the only thing kept in localStorage is a random device id and a harmless "a session may
 *   exist" hint, so anonymous visitors do not call /auth/refresh on every page load.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const DEVICE_KEY = 'ongod:device';
const SESSION_HINT = 'ongod:session';

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or blocked storage: the portal still works, it just forgets on reload.
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // see above
    }
  },
};

let memoryDeviceId: string | undefined;

/** A random id for this browser; the API counts it as one of the user's two devices. */
export function deviceId(): string {
  const saved = storage.get(DEVICE_KEY);
  if (saved && saved.length >= 8) return saved;
  memoryDeviceId ??= `web-${crypto.randomUUID()}`;
  storage.set(DEVICE_KEY, memoryDeviceId);
  return memoryDeviceId;
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | undefined;

export const session = {
  hasHint: () => storage.get(SESSION_HINT) === '1',
  /** Called after a login or a successful refresh. */
  start(token: string) {
    accessToken = token;
    storage.set(SESSION_HINT, '1');
  },
  /** Forget everything locally (logout, or a refresh that failed). */
  clear() {
    accessToken = null;
    storage.remove(SESSION_HINT);
  },
  /** The auth context listens here to switch to the signed-out state. */
  onLost(callback: (() => void) | undefined) {
    onSessionLost = callback;
  },
};

type Schema<T> = z.ZodType<T>;

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const parsed = errorResponseSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(res.status, code, message, details);
  }
  return new ApiError(res.status, 'INTERNAL', mn.common.errorGeneric);
}

let refreshing: Promise<boolean> | undefined;

/**
 * Gets a new access token with the refresh cookie. One refresh at a time: parallel callers share
 * the same promise (the API treats a second use of a rotated token as theft).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId() }),
      });
      if (!res.ok) {
        session.clear();
        return false;
      }
      session.start(tokenPairSchema.parse(await res.json()).accessToken);
      return true;
    } catch {
      // Offline: keep the hint, the next call may work.
      accessToken = null;
      return false;
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** Validates and types the JSON response. */
  schema?: Schema<T>;
  /** Public endpoints skip the token and the refresh-and-retry. */
  auth?: boolean;
  signal?: AbortSignal;
}

async function send(path: string, options: RequestOptions<unknown>): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.auth !== false && accessToken) headers.authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  try {
    return await fetch(`/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', mn.common.errorNetwork);
  }
}

export async function api<T = void>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  let res = await send(path, options);

  if (res.status === 401 && options.auth !== false && (session.hasHint() || accessToken)) {
    if (await refreshSession()) {
      res = await send(path, options);
    } else {
      onSessionLost?.();
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || !options.schema) return undefined as T;
  return options.schema.parse(await res.json());
}
