import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { api, ApiError, session } from '../src/api/client';

// A refresh that fails for a reason other than a refused token (rate limit, server error, no
// network) must not sign the admin out; only 401/403 from /auth/refresh ends the session.

const memory = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
} as Storage;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const error = (status: number, code: string) => json(status, { error: { code, message: code } });

/** /v1/admin/... answers 401 (expired token); /v1/auth/refresh answers `refresh`. */
function mockFetch(refresh: () => Response) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/v1/auth/refresh')) return refresh();
    return error(401, 'UNAUTHORIZED');
  }) as typeof fetch;
}

let lost = 0;
beforeEach(() => {
  memory.clear();
  session.start('expired-access-token');
  lost = 0;
  session.onLost(() => (lost += 1));
});

for (const [status, code] of [
  [429, 'RATE_LIMITED'],
  [500, 'INTERNAL'],
  [503, 'UNAVAILABLE'],
] as const) {
  test(`a ${status} from the refresh keeps the session and reports the error`, async () => {
    mockFetch(() => error(status, code));
    await assert.rejects(api('/admin/users'), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, status);
      return true;
    });
    assert.equal(lost, 0);
    assert.equal(session.hasHint(), true);
  });
}

test('no network during the refresh keeps the session', async () => {
  mockFetch(() => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(api('/admin/users'), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, 'NETWORK');
    return true;
  });
  assert.equal(lost, 0);
  assert.equal(session.hasHint(), true);
});

for (const status of [401, 403]) {
  test(`a ${status} from the refresh ends the session`, async () => {
    mockFetch(() => error(status, 'UNAUTHORIZED'));
    await assert.rejects(api('/admin/users'));
    assert.equal(lost, 1);
    assert.equal(session.hasHint(), false);
  });
}
