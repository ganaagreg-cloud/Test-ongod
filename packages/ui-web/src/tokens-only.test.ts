import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// CLAUDE.md: no hardcoded colors, sizes or fonts outside packages/tokens. The component CSS may
// only use token variables (var(--...)) and calc()/color-mix() of them.
const css = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

for (const file of ['ui.css', 'base.css']) {
  test(`${file} has no raw colors, pixel sizes or font names`, () => {
    const source = css(file);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, 'hex color');
    assert.doesNotMatch(source, /\b(?:rgb|rgba|hsl|hsla)\(/, 'color function');
    assert.doesNotMatch(source, /\b\d*\.?\d+px\b/, 'pixel size');
    assert.doesNotMatch(source, /\b\d*\.?\d+(?:rem|em|vh|vw)\b/, 'relative unit');
    assert.doesNotMatch(source, /font-family:\s*(?!var\()/, 'font family');
  });
}

test('every var(--...) the CSS uses is defined by the tokens CSS or the component CSS', () => {
  const tokens = readFileSync(new URL('../../tokens/css/tokens.css', import.meta.url), 'utf8');
  const own = css('ui.css');
  const defined = new Set([...(tokens + own).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set(
    [...(css('ui.css') + css('base.css')).matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]),
  );
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, []);
});
