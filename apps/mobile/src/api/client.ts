import { errorResponseSchema, tokenPairSchema, type TokenPair } from '@ongod/shared';
import type { z } from 'zod';

/**
 * The API client of the app (ADR-0008, ADR-0018):
 * - the access token lives in memory only; the refresh token is kept by `TokenStore`
 *   (SecureStore on the phone);
 * - a 401 triggers ONE refresh, however many requests fail at once, then the request is repeated;
 * - the rotated refresh token is saved before anything else uses the new access token, because
 *   the server treats a second use of an old refresh token as theft and ends the session.
 * It knows nothing about React or Expo, so it can be tested with a fake `fetch` and store.
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

export interface TokenStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ClientOptions {
  /** Server address without /v1, e.g. http://10.0.2.2:3000. */
  baseUrl: string;
  tokens: TokenStore;
  getDeviceId: () => Promise<string>;
  /** Fallback texts (Mongolian) for answers that carry no message of their own. */
  messages: { network: string; generic: string };
  /** Called once when the refresh token is dead: the user has to log in again. */
  onSessionLost?: () => void;
  fetch?: typeof fetch;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Validates and types the JSON answer. */
  schema?: z.ZodType<T>;
  /** Public endpoints (login, register, app-config) send no token and never refresh. */
  auth?: boolean;
  signal?: AbortSignal;
  /** Give up after this long and report a network error (default 20 s). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export function createApiClient(options: ClientOptions) {
  const doFetch = options.fetch ?? fetch;
  let accessToken: string | null = null;
  let refreshing: Promise<void> | undefined;

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
    return new ApiError(res.status, 'INTERNAL', options.messages.generic);
  }

  /** Fetch with a time limit; a timeout counts as "no network" (the phone's own limit is minutes). */
  async function fetchOrThrow(
    url: string,
    init: RequestInit,
    timeoutMs?: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const outer = init.signal;
    const forward = () => controller.abort();
    if (outer?.aborted) controller.abort();
    else outer?.addEventListener('abort', forward);
    try {
      return await doFetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      // The caller itself cancelled (a screen closed): not a network problem.
      if (outer?.aborted) throw err;
      throw new ApiError(0, 'NETWORK', options.messages.network);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    }
  }

  function send(path: string, opts: RequestOptions<unknown>, token: string | null) {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    return fetchOrThrow(
      `${options.baseUrl}/v1${path}`,
      {
        method: opts.method ?? 'GET',
        headers,
        ...(body !== undefined ? { body } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
      },
      opts.timeoutMs,
    );
  }

  async function endSession() {
    accessToken = null;
    await options.tokens.clear();
  }

  async function doRefresh(): Promise<void> {
    const refreshToken = await options.tokens.getRefreshToken();
    if (!refreshToken) {
      options.onSessionLost?.();
      throw new ApiError(401, 'UNAUTHORIZED', options.messages.generic);
    }
    const res = await fetchOrThrow(`${options.baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken, deviceId: await options.getDeviceId() }),
    });
    if (!res.ok) {
      const error = await toApiError(res);
      // Only a refused token ends the session; a server hiccup or no network keeps it, so the
      // user is not logged out by a tunnel.
      if (res.status === 401 || res.status === 403) {
        await endSession();
        options.onSessionLost?.();
      }
      throw error;
    }
    const pair = tokenPairSchema.parse(await res.json());
    if (!pair.refreshToken) throw new ApiError(500, 'INTERNAL', options.messages.generic);
    await options.tokens.setRefreshToken(pair.refreshToken);
    accessToken = pair.accessToken;
  }

  /** One refresh at a time: everybody who needs one waits for the same promise. */
  function refresh(): Promise<void> {
    refreshing ??= doRefresh().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  async function request<T = void>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
    const authed = opts.auth !== false;
    const tokenUsed = accessToken;
    let res = await send(path, opts, authed ? tokenUsed : null);

    if (res.status === 401 && authed) {
      // If another request already refreshed while this one was in flight, just use the new token.
      if (accessToken === null || accessToken === tokenUsed) await refresh();
      res = await send(path, opts, accessToken);
    }

    if (!res.ok) throw await toApiError(res);
    if (res.status === 204 || !opts.schema) return undefined as T;
    return opts.schema.parse(await res.json());
  }

  return {
    request,
    /** Takes over the tokens of a login (or a social login). */
    async startSession(pair: TokenPair): Promise<void> {
      if (!pair.refreshToken) throw new ApiError(500, 'INTERNAL', options.messages.generic);
      await options.tokens.setRefreshToken(pair.refreshToken);
      accessToken = pair.accessToken;
    },
    /** Forgets the tokens on this phone (after logout or account deletion). */
    endSession,
    /** True when there is something to restore a session from. */
    async hasStoredSession(): Promise<boolean> {
      return (await options.tokens.getRefreshToken()) !== null;
    },
    /** Restores the session at app start: new access token from the stored refresh token. */
    refresh,
    /** The refresh token, for the logout call. */
    getRefreshToken: () => options.tokens.getRefreshToken(),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
