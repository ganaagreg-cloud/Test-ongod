import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApiClient, type TokenStore } from '../src/api/client';

// The refresh rules matter more than anything else in the app: the server treats a second use of
// a rotated refresh token as theft and ends the session (ADR-0018). Everything runs against a
// fake fetch and a fake token store.

const MESSAGES = { network: 'NETWORK-TEXT', generic: 'GENERIC-TEXT' };

interface Call {
  url: string;
  method: string;
  authorization: string | undefined;
  body: unknown;
}

function fakeStore(initial: string | null = 'refresh-0') {
  const log: string[] = [];
  let token = initial;
  const store: TokenStore = {
    getRefreshToken: async () => token,
    setRefreshToken: async (value) => {
      log.push(`store:${value}`);
      token = value;
    },
    clear: async () => {
      log.push('clear');
      token = null;
    },
  };
  return { store, log, current: () => token };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const tokenPair = (n: number) =>
  json(200, { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn: 900 });
const unauthorized = () =>
  json(401, { error: { code: 'UNAUTHORIZED', message: 'Нэвтрэх шаардлагатай.' } });

/** A server stand-in: `handler` answers each call; every call is recorded. */
function setup(
  handler: (call: Call, index: number) => Response | Promise<Response>,
  options: { store?: ReturnType<typeof fakeStore>; onSessionLost?: () => void } = {},
) {
  const calls: Call[] = [];
  const store = options.store ?? fakeStore();
  const fetchFn = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const call: Call = {
      url: String(url),
      method: init.method ?? 'GET',
      authorization: headers.get('authorization') ?? undefined,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    store.log.push(`fetch:${new URL(call.url).pathname}`);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
  const client = createApiClient({
    baseUrl: 'http://api.test',
    tokens: store.store,
    getDeviceId: async () => 'device-12345678',
    messages: MESSAGES,
    fetch: fetchFn,
    ...(options.onSessionLost ? { onSessionLost: options.onSessionLost } : {}),
  });
  return { client, calls, store };
}

const isRefresh = (call: Call) => call.url.endsWith('/v1/auth/refresh');

test('a request carries the access token after login', async () => {
  const { client, calls } = setup(() => json(200, { ok: true }));
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  await client.request('/me');
  assert.equal(calls[0]?.authorization, 'Bearer access-0');
  assert.equal(calls[0]?.url, 'http://api.test/v1/me');
});

test('a 401 triggers one refresh and the request is repeated with the new token', async () => {
  const { client, calls } = setup((call) => {
    if (isRefresh(call)) return tokenPair(1);
    return call.authorization === 'Bearer access-1' ? json(200, { ok: true }) : unauthorized();
  });
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  await client.request('/me');
  assert.deepEqual(
    calls.map((c) => (isRefresh(c) ? 'refresh' : (c.authorization ?? 'none'))),
    ['Bearer access-0', 'refresh', 'Bearer access-1'],
  );
  // the refresh call sends the stored refresh token and the device id
  assert.deepEqual(calls[1]?.body, { refreshToken: 'refresh-0', deviceId: 'device-12345678' });
});

test('the rotated refresh token is saved BEFORE the repeated request uses the new access token', async () => {
  const { client, store } = setup((call) => {
    if (isRefresh(call)) return tokenPair(1);
    return call.authorization === 'Bearer access-1' ? json(200, {}) : unauthorized();
  });
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  store.log.length = 0;
  await client.request('/me');
  assert.deepEqual(store.log, [
    'fetch:/v1/me',
    'fetch:/v1/auth/refresh',
    'store:refresh-1',
    'fetch:/v1/me',
  ]);
});

test('many requests failing together cause exactly ONE refresh', async () => {
  const { client, calls } = setup(async (call) => {
    if (isRefresh(call)) {
      await new Promise((resolve) => setTimeout(resolve, 20)); // slow, so the others pile up
      return tokenPair(1);
    }
    return call.authorization === 'Bearer access-1' ? json(200, { ok: true }) : unauthorized();
  });
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  const results = await Promise.all(Array.from({ length: 6 }, () => client.request('/me')));
  assert.equal(results.length, 6);
  assert.equal(calls.filter(isRefresh).length, 1);
});

test('a request that fails after another one already refreshed does not refresh again', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { client, calls } = setup(async (call) => {
    if (isRefresh(call)) return tokenPair(1);
    const stale = call.authorization === 'Bearer access-0';
    // The slow request holds its answer back until the fast one has finished refreshing.
    if (call.url.endsWith('/slow') && stale) {
      await gate;
      return unauthorized();
    }
    return stale ? unauthorized() : json(200, {});
  });
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });

  const slow = client.request('/slow'); // sent with access-0, answer pending
  await client.request('/fast'); // 401, refreshes, succeeds
  release();
  await slow; // 401 for the OLD token: just repeats with the new one
  assert.equal(calls.filter(isRefresh).length, 1, 'one refresh served both');
  assert.equal(
    calls.filter((c) => c.url.endsWith('/slow')).at(-1)?.authorization,
    'Bearer access-1',
  );
});

test('a refused refresh token ends the session once and clears the phone', async () => {
  let lost = 0;
  const store = fakeStore();
  const { client } = setup(
    (call) =>
      isRefresh(call)
        ? json(401, { error: { code: 'UNAUTHORIZED', message: 'Нэвтрэх шаардлагатай.' } })
        : unauthorized(),
    { store, onSessionLost: () => lost++ },
  );
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  await assert.rejects(
    client.request('/me'),
    (err: unknown) => err instanceof ApiError && err.status === 401,
  );
  assert.equal(lost, 1);
  assert.equal(store.current(), null);
});

test('no network during refresh keeps the session (a tunnel must not log the user out)', async () => {
  let lost = 0;
  const store = fakeStore();
  const { client } = setup(
    (call) => {
      if (isRefresh(call)) throw new TypeError('Network request failed');
      return unauthorized();
    },
    { store, onSessionLost: () => lost++ },
  );
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  await assert.rejects(
    client.request('/me'),
    (err: unknown) =>
      err instanceof ApiError && err.code === 'NETWORK' && err.message === 'NETWORK-TEXT',
  );
  assert.equal(lost, 0);
  assert.equal(store.current(), 'refresh-0');
});

test('a server error during refresh keeps the session too', async () => {
  let lost = 0;
  const store = fakeStore();
  const { client } = setup(
    (call) =>
      isRefresh(call)
        ? json(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } })
        : unauthorized(),
    { store, onSessionLost: () => lost++ },
  );
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  await assert.rejects(
    client.request('/me'),
    (err: unknown) => err instanceof ApiError && err.status === 503,
  );
  assert.equal(lost, 0);
  assert.equal(store.current(), 'refresh-0');
});

test('without a stored refresh token a 401 means "log in again"', async () => {
  let lost = 0;
  const { client } = setup(() => unauthorized(), {
    store: fakeStore(null),
    onSessionLost: () => lost++,
  });
  await assert.rejects(
    client.request('/me'),
    (err: unknown) => err instanceof ApiError && err.status === 401,
  );
  assert.equal(lost, 1);
});

test('public requests send no token and never refresh', async () => {
  const { client, calls } = setup(() => unauthorized());
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  await assert.rejects(
    client.request('/auth/login', { method: 'POST', body: { a: 1 }, auth: false }),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.authorization, undefined);
});

test('a second 401 after the refresh is reported, not looped', async () => {
  const { client, calls } = setup((call) => (isRefresh(call) ? tokenPair(1) : unauthorized()));
  await client.startSession({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresIn: 900 });
  await assert.rejects(
    client.request('/me'),
    (err: unknown) => err instanceof ApiError && err.status === 401,
  );
  assert.equal(calls.length, 3); // request, refresh, one repeat
});

test('API errors keep their code, Mongolian message and details', async () => {
  const { client } = setup(() =>
    json(409, {
      error: { code: 'DEVICE_LIMIT', message: 'Төхөөрөмж дүүрсэн.', details: { devices: [] } },
    }),
  );
  await assert.rejects(client.request('/auth/login', { auth: false }), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, 'DEVICE_LIMIT');
    assert.equal(err.message, 'Төхөөрөмж дүүрсэн.');
    assert.deepEqual(err.details, { devices: [] });
    return true;
  });
});

test('an answer that is not the error shape gets the general message', async () => {
  const { client } = setup(() => new Response('<html>oops</html>', { status: 502 }));
  await assert.rejects(
    client.request('/me', { auth: false }),
    (err: unknown) =>
      err instanceof ApiError && err.status === 502 && err.message === 'GENERIC-TEXT',
  );
});

test('a request that takes too long is reported as a network error', async () => {
  const hang = (async (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    })) as typeof fetch;
  const client = createApiClient({
    baseUrl: 'http://api.test',
    tokens: fakeStore().store,
    getDeviceId: async () => 'device-12345678',
    messages: MESSAGES,
    fetch: hang,
  });
  await assert.rejects(
    client.request('/app-config', { auth: false, timeoutMs: 30 }),
    (err: unknown) => err instanceof ApiError && err.code === 'NETWORK',
  );
});

test('a 204 answer returns nothing', async () => {
  const { client } = setup(() => new Response(null, { status: 204 }));
  assert.equal(
    await client.request('/auth/verify-email', { method: 'POST', auth: false }),
    undefined,
  );
});
