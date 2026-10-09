import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { appConfigKeys } from '@ongod/shared';
import { parseEnv } from '../src/env';
import { createDb } from '../src/db';
import { buildApp } from '../src/app';
import { testApp, testDb, testEnv } from './helpers';

describe('env', () => {
  it('fails fast and names the invalid keys without echoing values', () => {
    expect(() =>
      parseEnv({ PUBLIC_BASE_URL: 'not a url', DATABASE_URL: 'postgres://secret-value' }),
    ).toThrowError(/CRON_SECRET[\s\S]*SMTP_HOST/);
    try {
      parseEnv({ DATABASE_URL: 'postgres://secret-value' });
    } catch (err) {
      expect((err as Error).message).not.toContain('secret-value');
    }
  });
});

describe('GET /health', () => {
  it('reports ok when the database answers', async () => {
    const app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 in the error shape when the database is unreachable', async () => {
    const deadDb = createDb('mysql://nobody:nothing@127.0.0.1:1/none?connectTimeout=500');
    const app = await buildApp({ env: testEnv(), db: deadDb });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE');
    // Not awaited: the driver keeps retrying the dead host until its own connect timeout.
    void deadDb.$disconnect();
  });
});

describe('GET /v1/app-config', () => {
  it('is public and returns only the allowed fields', async () => {
    await testDb.appConfig.createMany({
      data: [
        { key: appConfigKeys.minVersionIos, value: '1.2.0' },
        { key: appConfigKeys.minVersionAndroid, value: '1.1.0' },
        { key: 'some_other_key', value: 'must not leak' },
      ],
    });
    const app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/v1/app-config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      minVersion: { ios: '1.2.0', android: '1.1.0' },
      socialLogin: false,
    });
  });

  it('falls back to 0.0.0 when no minimum version is configured', async () => {
    const app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/v1/app-config' });
    expect(res.json().minVersion).toEqual({ ios: '0.0.0', android: '0.0.0' });
  });
});

describe('HTTP basics', () => {
  it('returns 404 in the error shape for unknown API routes', async () => {
    const app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('echoes a valid X-Request-Id and generates one otherwise', async () => {
    const app = await testApp();
    const given = await app.inject({ url: '/health', headers: { 'x-request-id': 'abc-123' } });
    expect(given.headers['x-request-id']).toBe('abc-123');
    const generated = await app.inject({ url: '/health', headers: { 'x-request-id': 'bad id!' } });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows CORS only for configured origins', async () => {
    const app = await testApp();
    const allowed = await app.inject({
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await app.inject({ url: '/health', headers: { origin: 'https://evil.example' } });
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets security headers', async () => {
    const app = await testApp();
    const res = await app.inject({ url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('rate limits with 429 in the error shape', async () => {
    const app = await buildApp({ env: testEnv({ RATE_LIMIT_MAX: '2' }), db: testDb });
    for (let i = 0; i < 2; i++) await app.inject({ url: '/v1/app-config' });
    const res = await app.inject({ url: '/v1/app-config' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('RATE_LIMITED');
  });
});

describe('static hosting', () => {
  function fakeBuilds() {
    const root = mkdtempSync(join(tmpdir(), 'ongod-static-'));
    for (const app of ['portal', 'admin']) {
      mkdirSync(join(root, app, 'assets'), { recursive: true });
      writeFileSync(join(root, app, 'index.html'), `<html>${app}</html>`);
      writeFileSync(join(root, app, 'assets', 'app-abc123.js'), `/* ${app} */`);
      // The portal build ships .br and .gz copies (apps/portal/vite.config.ts).
      if (app === 'portal') {
        for (const file of ['index.html', join('assets', 'app-abc123.js')]) {
          const data = readFileSync(join(root, app, file));
          writeFileSync(join(root, app, `${file}.br`), brotliCompressSync(data));
          writeFileSync(join(root, app, `${file}.gz`), gzipSync(data));
        }
      }
    }
    return { portal: join(root, 'portal'), admin: join(root, 'admin') };
  }

  async function staticApp() {
    return buildApp({
      env: testEnv({ SERVE_STATIC: 'true' }),
      db: testDb,
      staticDirs: fakeBuilds(),
    });
  }

  const html = { accept: 'text/html' };

  it('serves the portal at / and the admin at /admin/ with SPA fallbacks', async () => {
    const app = await staticApp();
    expect((await app.inject({ url: '/', headers: html })).body).toContain('portal');
    expect((await app.inject({ url: '/plans/yearly', headers: html })).body).toContain('portal');
    expect((await app.inject({ url: '/admin/', headers: html })).body).toContain('admin');
    expect((await app.inject({ url: '/admin/users/42', headers: html })).body).toContain('admin');
  });

  it('caches hashed assets forever and HTML never', async () => {
    const app = await staticApp();
    const asset = await app.inject({ url: '/assets/app-abc123.js' });
    expect(asset.headers['cache-control']).toContain('immutable');
    const page = await app.inject({ url: '/some/page', headers: html });
    expect(page.headers['cache-control']).toBe('no-cache');
  });

  it('serves the pre-compressed copy to browsers that accept it, and the plain file to others', async () => {
    const app = await staticApp();
    const url = '/assets/app-abc123.js';

    const br = await app.inject({ url, headers: { 'accept-encoding': 'gzip, br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(br.rawPayload).toString()).toBe('/* portal */');
    expect(br.headers['content-type']).toMatch(/javascript/);
    expect(String(br.headers.vary)).toMatch(/accept-encoding/i);

    const gz = await app.inject({ url, headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gz.rawPayload).toString()).toBe('/* portal */');

    const plain = await app.inject({ url });
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body).toBe('/* portal */');
  });

  it('compresses the SPA fallback page too', async () => {
    const app = await staticApp();
    const res = await app.inject({
      url: '/plans',
      headers: { accept: 'text/html', 'accept-encoding': 'br' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(res.rawPayload).toString()).toBe('<html>portal</html>');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('keeps API 404s as JSON, never index.html', async () => {
    const app = await staticApp();
    const res = await app.inject({ url: '/v1/unknown', headers: html });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 404 JSON for missing non-HTML files', async () => {
    const app = await staticApp();
    const res = await app.inject({ url: '/assets/missing.js' });
    expect(res.statusCode).toBe(404);
  });
});
