import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { portalLink } from '../src/lib/portalLink';

test('no portal URL: no link (the screens hide it)', () => {
  assert.equal(portalLink(undefined, '/terms'), undefined);
  assert.equal(portalLink('', '/terms'), undefined);
  assert.equal(portalLink('   ', '/privacy'), undefined);
});

test('a portal URL gives the page address, trailing slashes removed', () => {
  assert.equal(
    portalLink('https://portal.example.test', '/terms'),
    'https://portal.example.test/terms',
  );
  assert.equal(
    portalLink('https://portal.example.test///', '/privacy'),
    'https://portal.example.test/privacy',
  );
  assert.equal(portalLink(' http://192.168.1.5:3000 ', '/terms'), 'http://192.168.1.5:3000/terms');
});

test('anything that is not an http(s) address is refused', () => {
  assert.equal(portalLink('javascript:alert(1)', '/terms'), undefined);
  assert.equal(portalLink('ongod.example', '/terms'), undefined);
  assert.equal(portalLink('ftp://example.test', '/terms'), undefined);
});

// ADR-0053: the app opens only the app-only portal pages (/app/...), which have no navigation
// and no payment wording. A plain /terms or /plans link would put the price page one tap away.
test('every portal link in the app goes to an /app/ page', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  const paths = [...files(join(root, 'app')), ...files(join(root, 'src'))].flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/portalLink\([^,]+,\s*'([^']*)'/g)].map((m) => m[1]),
  );
  assert.ok(paths.length >= 2, 'no portal links found: the pattern is stale');
  for (const path of paths) assert.match(path!, /^\/app\//);
});
