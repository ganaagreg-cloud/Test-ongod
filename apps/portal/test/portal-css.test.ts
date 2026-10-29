import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// CLAUDE.md: no hardcoded colors, sizes or fonts outside packages/tokens.
const source = readFileSync(new URL('../src/portal.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

test('portal.css has no raw colors, pixel sizes or font names', () => {
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, 'hex color');
  assert.doesNotMatch(source, /\b(?:rgb|rgba|hsl|hsla)\(/, 'color function');
  assert.doesNotMatch(source, /\b\d*\.?\d+px\b/, 'pixel size');
  assert.doesNotMatch(source, /\b\d*\.?\d+(?:rem|em|vh|vw)\b/, 'relative unit');
  assert.doesNotMatch(source, /font-family:\s*(?!var\()/, 'font family');
});

test('every var(--...) in portal.css exists in the tokens, the component CSS or portal.css', () => {
  // Array.from, not .matchAll(...).map: kept simple and portable.
  const defined = new Set(
    Array.from(
      [
        readFileSync(new URL('../../../packages/tokens/css/tokens.css', import.meta.url), 'utf8'),
        readFileSync(new URL('../../../packages/ui-web/src/ui.css', import.meta.url), 'utf8'),
        // Custom properties portal.css declares itself (e.g. --portal-ring, set from a page).
        source,
      ]
        .join('\n')
        .matchAll(/(--[a-z0-9-]+)\s*:/g),
      (m) => m[1],
    ),
  );
  const used = new Set([...source.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.deepEqual(
    [...used].filter((name) => !defined.has(name)),
    [],
  );
});

test('no page text is hardcoded in the pages (it lives in i18n/mn.ts)', () => {
  // A heuristic: JSX text with Cyrillic letters outside mn.ts means a hardcoded string.
  const pages = [
    'Landing',
    'Plans',
    'Login',
    'Register',
    'Verify',
    'Forgot',
    'Reset',
    'Pay',
    'Status',
    'Account',
    'Legal',
    'DeleteAccount',
    'NotFound',
    'GiftBuy',
    'MyGifts',
    'Redeem',
    'MockGiftCheckout',
  ];
  for (const page of pages) {
    const code = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(code, /[Ѐ-ӿ]/, `${page}.tsx contains Cyrillic text`);
  }
});
