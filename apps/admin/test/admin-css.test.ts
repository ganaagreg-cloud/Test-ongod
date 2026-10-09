import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// CLAUDE.md: no hardcoded colors, sizes or fonts outside packages/tokens, and all user-facing
// text lives in i18n/mn.ts.
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const source = readFileSync(new URL('../src/admin.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

test('admin.css has no raw colors, pixel sizes or font names', () => {
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, 'hex color');
  assert.doesNotMatch(source, /\b(?:rgb|rgba|hsl|hsla)\(/, 'color function');
  assert.doesNotMatch(source, /\b\d*\.?\d+px\b/, 'pixel size');
  assert.doesNotMatch(source, /\b\d*\.?\d+(?:rem|em|vh|vw)\b/, 'relative unit');
  assert.doesNotMatch(source, /font-family:\s*(?!var\()/, 'font family');
  assert.doesNotMatch(source, /font-weight:\s*\d/, 'font weight');
});

test('every var(--...) in admin.css exists in the tokens or the component CSS', () => {
  const defined = new Set(
    [
      readFileSync(new URL('../../../packages/tokens/css/tokens.css', import.meta.url), 'utf8'),
      readFileSync(new URL('../../../packages/ui-web/src/ui.css', import.meta.url), 'utf8'),
    ]
      .join('\n')
      .matchAll(/(--[a-z0-9-]+)\s*:/g)
      .map((m) => m[1]),
  );
  const used = new Set([...source.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.deepEqual(
    [...used].filter((name) => !defined.has(name)),
    [],
  );
});

test('no screen text is hardcoded in components (it lives in i18n/mn.ts)', () => {
  // A heuristic: Cyrillic letters in a .tsx file mean a hardcoded string.
  for (const dir of ['pages', 'components', 'auth', 'layout', 'upload']) {
    const base = new URL(`../src/${dir}/`, import.meta.url);
    for (const file of readdirSync(base).filter((name) => name.endsWith('.tsx'))) {
      const code = stripComments(readFileSync(new URL(file, base), 'utf8'));
      assert.doesNotMatch(code, /[Ѐ-ӿ]/, `${dir}/${file} contains Cyrillic text`);
    }
  }
});

test('inline styles carry no raw sizes or colors', () => {
  for (const dir of ['pages', 'components', 'auth', 'layout', 'upload']) {
    const base = new URL(`../src/${dir}/`, import.meta.url);
    for (const file of readdirSync(base).filter((name) => name.endsWith('.tsx'))) {
      const code = stripComments(readFileSync(new URL(file, base), 'utf8'));
      assert.doesNotMatch(code, /\b\d+(?:px|rem|em)\b/, `${dir}/${file} has a raw size`);
      assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b/, `${dir}/${file} has a raw color`);
    }
  }
});
