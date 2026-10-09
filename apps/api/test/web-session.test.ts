import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { REFRESH_COOKIE } from '../src/auth/web-session';
import { authApp, device, login, post, register } from './auth-helpers';
import { testDb } from './helpers';

let app: FastifyInstance;
afterEach(async () => {
  await app.close();
});

const web = (n: number | string = 1) => device(n, 'web');

async function webLogin(email = 'bat@example.com', dev = web()) {
  await register(app, { email });
  const res = await login(app, email, dev);
  expect(res.statusCode).toBe(200);
  return res;
}

const cookieOf = (res: Awaited<ReturnType<FastifyInstance['inject']>>) =>
  res.cookies.find((c) => c.name === REFRESH_COOKIE);

/** A request the way a browser makes it: the refresh cookie plus an Origin. */
const withCookie = (url: string, cookie: string, payload: unknown, origin?: string) =>
  app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: { cookie: `${REFRESH_COOKIE}=${cookie}`, ...(origin ? { origin } : {}) },
  });

describe('web login: the refresh token lives in an httpOnly cookie (ADR-0026)', () => {
  it('sets the cookie and keeps the refresh token out of the body', async () => {
    app = await authApp();
    const res = await webLogin();

    const cookie = cookieOf(res)!;
    expect(cookie.value.length).toBeGreaterThan(20);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/v1/auth' });
    expect(cookie.maxAge).toBe(30 * 24 * 60 * 60);

    const body = res.json();
    expect(body.refreshToken).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(cookie.value);
    expect(body.accessToken).toBeTruthy();
    expect(body.user.email).toBe('bat@example.com');

    // The access token alone is enough for the API.
    const me = await app.inject({
      url: '/v1/me',
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
  });

  it('is Secure over https and not over plain http (local dev)', async () => {
    app = await authApp();
    expect(cookieOf(await webLogin())!.secure).toBeFalsy();
    await app.close();

    app = await authApp({ PUBLIC_BASE_URL: 'https://ongod.example.mn' });
    expect(cookieOf(await webLogin('other@example.com'))!.secure).toBe(true);
  });

  it('native platforms still get the token in the body and no cookie', async () => {
    app = await authApp();
    await register(app);
    for (const platform of ['android', 'ios']) {
      const res = await login(app, 'bat@example.com', device(platform, platform));
      expect(res.json().refreshToken).toMatch(/.{20,}/);
      expect(cookieOf(res)).toBeUndefined();
    }
  });
});

describe('refresh through the cookie', () => {
  it('rotates: a new access token and a new cookie, the old cookie value is dead', async () => {
    app = await authApp();
    const first = cookieOf(await webLogin())!.value;

    const res = await withCookie('/v1/auth/refresh', first, { deviceId: web().deviceId });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accessToken: expect.any(String), expiresIn: 900 });
    expect(res.json().refreshToken).toBeUndefined();
    const second = cookieOf(res)!;
    expect(second.value).not.toBe(first);
    expect(second.httpOnly).toBe(true);

    // The new cookie works...
    const again = await withCookie('/v1/auth/refresh', second.value, { deviceId: web().deviceId });
    expect(again.statusCode).toBe(200);

    // ...and replaying the first one is reuse: 401, the whole family dies, the cookie is cleared.
    const reuse = await withCookie('/v1/auth/refresh', first, { deviceId: web().deviceId });
    expect(reuse.statusCode).toBe(401);
    expect(cookieOf(reuse)).toMatchObject({ value: '', maxAge: 0 });
    const dead = await withCookie('/v1/auth/refresh', cookieOf(again)!.value, {
      deviceId: web().deviceId,
    });
    expect(dead.statusCode).toBe(401);
  });

  it('401 with neither a cookie nor a body token', async () => {
    app = await authApp();
    await webLogin();
    const res = await post(app, '/v1/auth/refresh', { deviceId: web().deviceId });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('401 for a cookie from another device', async () => {
    app = await authApp();
    const cookie = cookieOf(await webLogin())!.value;
    const res = await withCookie('/v1/auth/refresh', cookie, { deviceId: web('stolen').deviceId });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a foreign Origin (403), allows the site origin and the configured dev origin', async () => {
    app = await authApp({ PUBLIC_BASE_URL: 'https://ongod.example.mn' });
    let cookie = cookieOf(await webLogin())!.value;
    const refresh = (origin?: string) =>
      withCookie('/v1/auth/refresh', cookie, { deviceId: web().deviceId }, origin);

    const evil = await refresh('https://evil.example.com');
    expect(evil.statusCode).toBe(403);
    // The refused request did not use up the token.
    const ok = await refresh('https://ongod.example.mn');
    expect(ok.statusCode).toBe(200);
    cookie = cookieOf(ok)!.value;

    const dev = await refresh('http://localhost:5173'); // CORS_ORIGINS in the test env
    expect(dev.statusCode).toBe(200);
    cookie = cookieOf(dev)!.value;

    // No Origin header at all (a non-browser client with the cookie) is not blocked.
    expect((await refresh()).statusCode).toBe(200);
  });

  it('a body token wins over the cookie, so the native flow is unchanged', async () => {
    app = await authApp();
    await register(app);
    const native = (await login(app, 'bat@example.com', device('n', 'android'))).json();
    const res = await post(app, '/v1/auth/refresh', {
      refreshToken: native.refreshToken,
      deviceId: device('n', 'android').deviceId,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().refreshToken).toMatch(/.{20,}/);
    expect(cookieOf(res)).toBeUndefined();
  });
});

describe('logout through the cookie', () => {
  it('revokes the session, clears the cookie and is idempotent', async () => {
    app = await authApp();
    const cookie = cookieOf(await webLogin())!.value;

    const out = await withCookie('/v1/auth/logout', cookie, {});
    expect(out.statusCode).toBe(204);
    expect(cookieOf(out)).toMatchObject({ value: '', maxAge: 0 });

    const refresh = await withCookie('/v1/auth/refresh', cookie, { deviceId: web().deviceId });
    expect(refresh.statusCode).toBe(401);
    // Logging out freed the device slot.
    expect(await testDb.device.count()).toBe(0);

    expect((await post(app, '/v1/auth/logout', {})).statusCode).toBe(204);
  });

  it('refuses a foreign Origin and leaves the session alone', async () => {
    app = await authApp();
    const cookie = cookieOf(await webLogin())!.value;
    const out = await withCookie('/v1/auth/logout', cookie, {}, 'https://evil.example.com');
    expect(out.statusCode).toBe(403);
    const refresh = await withCookie('/v1/auth/refresh', cookie, { deviceId: web().deviceId });
    expect(refresh.statusCode).toBe(200);
  });
});

describe('web devices count like any device (SPEC B)', () => {
  it('the 3rd device is refused for web too, with the list so the portal can offer a removal', async () => {
    app = await authApp();
    await register(app);
    for (const n of [1, 2])
      expect((await login(app, 'bat@example.com', web(n))).statusCode).toBe(200);
    const third = await login(app, 'bat@example.com', web(3));
    expect(third.statusCode).toBe(403);
    expect(third.json().error.code).toBe('DEVICE_LIMIT');
    expect(third.json().error.details.devices).toHaveLength(2);
    expect(cookieOf(third)).toBeUndefined();
  });
});
