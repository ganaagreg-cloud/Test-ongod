import { errorResponseSchema, tokenPairSchema } from '@ongod/shared';
import type { z } from 'zod';
import { mn } from '../i18n/mn';

/**
 * Talks to the API (same origin: Vite proxies /v1 in development, one process serves both in
 * production). Session handling follows ADR-0026, with the admin's own cookie (platform "admin"):
 * - the access token lives only in this module's memory, never in web storage;
 * - the refresh token is an httpOnly cookie that scripts cannot read;
 * - localStorage keeps a random device id and a harmless "a session may exist" hint.
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

const DEVICE_KEY = 'ongod:admin-device';
const SESSION_HINT = 'ongod:admin-session';

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
      // Blocked storage: the admin still works, it just forgets on reload.
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
  memoryDeviceId ??= `admin-${crypto.randomUUID()}`;
  storage.set(DEVICE_KEY, memoryDeviceId);
  return memoryDeviceId;
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | undefined;
let onTotpNeeded: (() => void) | undefined;

export const session = {
  hasHint: () => storage.get(SESSION_HINT) === '1',
  token: () => accessToken,
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
  /** ...and here to show the authenticator screen when the API asks for the second factor. */
  onTotpNeeded(callback: (() => void) | undefined) {
    onTotpNeeded = callback;
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
        body: JSON.stringify({ deviceId: deviceId(), platform: 'admin' }),
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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** Validates and types the JSON response. */
  schema?: Schema<T>;
  /** Public endpoints skip the token and the refresh-and-retry. */
  auth?: boolean;
  signal?: AbortSignal | undefined;
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

/** Sends the request; on a 401 refreshes the token once and retries. */
async function sendWithRefresh(path: string, options: RequestOptions<unknown>): Promise<Response> {
  let res = await send(path, options);
  if (res.status === 401 && options.auth !== false && (session.hasHint() || accessToken)) {
    if (await refreshSession()) {
      res = await send(path, options);
    } else {
      onSessionLost?.();
    }
  }
  return res;
}

/** Builds the error for a failed response; a missing second factor also notifies the auth gate. */
async function fail(res: Response): Promise<ApiError> {
  const error = await toApiError(res);
  if (error.code === 'TOTP_REQUIRED' || error.code === 'TOTP_SETUP_REQUIRED') onTotpNeeded?.();
  return error;
}

export async function api<T = void>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const res = await sendWithRefresh(path, options);
  if (!res.ok) throw await fail(res);
  if (res.status === 204 || !options.schema) return undefined as T;
  return options.schema.parse(await res.json());
}

/** For files behind the login (receipt image, CSV): the body as a Blob plus the file name, if any. */
export async function apiBlob(
  path: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string | undefined }> {
  const res = await sendWithRefresh(path, { signal });
  if (!res.ok) throw await fail(res);
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  return { blob: await res.blob(), filename };
}
