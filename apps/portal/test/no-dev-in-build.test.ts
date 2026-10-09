import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// Nothing meant for development may reach what customers download: the component gallery, the
// development JSX runtime. Needs a build first (pnpm build); skipped when there is none.
for (const app of ['portal', 'admin']) {
  const assets = new URL(`../../${app}/dist/assets/`, import.meta.url);
  const built = existsSync(assets);

  test(`${app} production build has no dev-only code`, { skip: !built && 'no build yet' }, () => {
    const files = readdirSync(assets);
    assert.deepEqual(
      files.filter((name) => /gallery/i.test(name)),
      [],
      'a Gallery chunk was emitted',
    );
    for (const name of files.filter((n) => n.endsWith('.js'))) {
      const code = readFileSync(new URL(name, assets), 'utf8');
      assert.ok(!code.includes('Mongolian glyph test'), `${name} contains the component gallery`);
      assert.ok(!code.includes('jsxDEV'), `${name} uses the development JSX runtime`);
    }
  });
}
