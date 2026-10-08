import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBunnySigner } from '../src/lib/bunnyToken';

/**
 * Oracle test: our signer must produce exactly what Bunny's reference implementation produces.
 * The reference file is fetched, not vendored (no upstream license): see
 * scripts/fetch-bunny-reference.ts. `pnpm test` fetches it when missing.
 */
const referencePath = resolve(import.meta.dirname, 'fixtures/bunny-reference/token.cjs');
if (!existsSync(referencePath)) {
  throw new Error('Bunny reference missing. Run: pnpm --filter @ongod/api bunny:reference');
}
const reference = createRequire(import.meta.url)(referencePath) as {
  signUrl: (
    url: string,
    securityKey: string,
    expirationTime?: number,
    userIp?: string,
    isDirectory?: boolean,
    pathAllowed?: string,
    countriesAllowed?: string,
    countriesBlocked?: string,
    ignoreParams?: boolean,
    expiresAt?: number | null,
  ) => string;
};

const HOST = 'ongod-test.b-cdn.net';
const KEY = 'c0ffee00-1234-4abc-9def-0123456789ab';
const signer = createBunnySigner({ host: HOST, tokenKey: KEY });

/** Small seeded PRNG so a failing case can be reproduced. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEGMENT_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-~%20+,@:()!$&=;';
// Includes space, &, =, +, %, quotes: everything that has to survive encodeURIComponent.
const VALUE_CHARS = SEGMENT_CHARS + ' \'"/?#[]{}|\\^`<>*';

describe('bunnyToken: oracle against Bunny reference token.js', () => {
  it('matches the reference on 50 generated cases', () => {
    const rnd = mulberry32(20261008);
    const pick = (chars: string, min: number, max: number) =>
      Array.from(
        { length: min + Math.floor(rnd() * (max - min + 1)) },
        () => chars[Math.floor(rnd() * chars.length)],
      ).join('');

    let withTokenPath = 0;
    let withQuery = 0;

    for (let i = 0; i < 50; i++) {
      const segments = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
        pick(SEGMENT_CHARS, 1, 12),
      );
      const path = `/${segments.join('/')}${rnd() < 0.5 ? '.mp3' : ''}`;
      const expiresAtSec = 1_700_000_000 + Math.floor(rnd() * 400_000_000);
      const tokenPath = rnd() < 0.5 ? `/${pick(SEGMENT_CHARS, 1, 10)}/` : undefined;

      let query: Record<string, string> | undefined;
      if (rnd() < 0.5) {
        query = {};
        const keys = ['a', 'B', 'z_9', 'quality', 'x-y', 'Zed', '1st', 'lang'];
        for (const key of keys.filter(() => rnd() < 0.4)) query[key] = pick(VALUE_CHARS, 0, 10);
        if (Object.keys(query).length === 0) query = undefined;
      }
      if (tokenPath) withTokenPath++;
      if (query) withQuery++;

      // Same inputs, expressed the way the reference takes them: a URL plus options.
      const qs = query
        ? '?' +
          Object.entries(query)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&')
        : '';
      const expected = reference.signUrl(
        `https://${HOST}${path}${qs}`,
        KEY,
        0,
        '',
        false,
        tokenPath ?? '',
        '',
        '',
        false,
        expiresAtSec,
      );
      const actual = signer.signUrl({
        path,
        expiresAt: new Date(expiresAtSec * 1000),
        tokenPath,
        query,
      });

      expect(
        actual,
        `case ${i}: path=${path} tokenPath=${tokenPath} query=${JSON.stringify(query)}`,
      ).toBe(expected);
    }

    // The generator really exercises both options.
    expect(withTokenPath).toBeGreaterThan(10);
    expect(withQuery).toBeGreaterThan(10);
  });

  it('drops fractional seconds like the reference (expires is whole seconds)', () => {
    const expected = reference.signUrl(
      `https://${HOST}/a/b.mp3`,
      KEY,
      0,
      '',
      false,
      '',
      '',
      '',
      false,
      1_900_000_000,
    );
    const actual = signer.signUrl({ path: '/a/b.mp3', expiresAt: new Date(1_900_000_000_999) });
    expect(actual).toBe(expected);
  });
});

describe('bunnyToken: output shape and guard rails', () => {
  const expiresAt = new Date(1_900_000_000_000);

  it('builds https://<host><path>?token=HS256-<base64url>&expires=<seconds>', () => {
    const url = signer.signUrl({ path: '/episodes/e1/audio.mp3', expiresAt });
    expect(url).toMatch(
      new RegExp(
        `^https://${HOST}/episodes/e1/audio\\.mp3\\?token=HS256-[A-Za-z0-9_-]{43}&expires=1900000000$`,
      ),
    );
  });

  it('has no IP parameter or IP flag (ADR-0020)', () => {
    const url = signer.signUrl({ path: '/a.mp3', expiresAt });
    expect(url).not.toMatch(/ip/i);
    expect(url).not.toContain('HS256-1-');
  });

  it('adds token_path (URL-encoded) only for directory tokens', () => {
    const plain = signer.signUrl({ path: '/v/1/playlist.m3u8', expiresAt });
    const dir = signer.signUrl({ path: '/v/1/playlist.m3u8', expiresAt, tokenPath: '/v/1/' });
    expect(plain).not.toContain('token_path');
    expect(dir).toContain('token_path=%2Fv%2F1%2F');
  });

  it('a directory token is the same for every file under the directory', () => {
    const token = (path: string) =>
      new URL(signer.signUrl({ path, expiresAt, tokenPath: '/v/1/' })).searchParams.get('token');
    expect(token('/v/1/a.ts')).toBe(token('/v/1/b.ts'));
  });

  it('depends on path, expiry and key', () => {
    const token = (s: typeof signer, path: string, at: Date) =>
      new URL(s.signUrl({ path, expiresAt: at })).searchParams.get('token');
    const base = token(signer, '/a.mp3', expiresAt);
    expect(token(signer, '/b.mp3', expiresAt)).not.toBe(base);
    expect(token(signer, '/a.mp3', new Date(expiresAt.getTime() + 1000))).not.toBe(base);
    const other = createBunnySigner({ host: HOST, tokenKey: 'another-key' });
    expect(token(other, '/a.mp3', expiresAt)).not.toBe(base);
  });

  it.each([
    ['non-ASCII path', { path: '/эпизод/онгод.mp3' }],
    ['non-ASCII character mixed into a path', { path: '/episodes/e1/audiө.mp3' }],
    ['non-ASCII tokenPath', { path: '/a.mp3', tokenPath: '/өвөг/' }],
    ['non-ASCII query value', { path: '/a.mp3', query: { q: 'Үүл' } }],
    ['non-ASCII query key', { path: '/a.mp3', query: { ө: '1' } }],
    ['space in path', { path: '/a b.mp3' }],
    ['control character in path', { path: '/a\u0000.mp3' }],
    ['path without leading slash', { path: 'a.mp3' }],
    ['query string inside path', { path: '/a.mp3?x=1' }],
    ['fragment inside path', { path: '/a.mp3#t' }],
    ['empty path', { path: '' }],
    ['tokenPath without leading slash', { path: '/a.mp3', tokenPath: 'v/' }],
    ['reserved query key token', { path: '/a.mp3', query: { token: 'x' } }],
    ['reserved query key expires', { path: '/a.mp3', query: { expires: '1' } }],
    ['reserved query key token_path', { path: '/a.mp3', query: { token_path: '/' } }],
  ])('throws on %s', (_name, input) => {
    expect(() => signer.signUrl({ expiresAt, ...input })).toThrow();
  });

  it('rejects an empty key and a host with a scheme or path', () => {
    expect(() => createBunnySigner({ host: HOST, tokenKey: '' })).toThrow();
    expect(() => createBunnySigner({ host: `https://${HOST}`, tokenKey: KEY })).toThrow();
    expect(() => createBunnySigner({ host: `${HOST}/x`, tokenKey: KEY })).toThrow();
  });
});
