import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// CLAUDE.md: no hardcoded colors, sizes or fonts outside packages/tokens. Every file in
// src/ui must take them from @ongod/tokens.
const dir = new URL('../src/ui/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

const SIZE_KEYS = String.raw`width|height|minWidth|maxWidth|minHeight|maxHeight|padding\w*|margin\w*|gap|fontSize|lineHeight|borderRadius|border\w*Width|top|left|right|bottom`;

/** The rules a UI source must pass; each returns true when the source is clean. */
export const RULES: Array<[string, RegExp]> = [
  ['hex color', /#[0-9a-fA-F]{3,8}\b/],
  ['color function', /\b(?:rgb|rgba|hsl|hsla)\(/],
  ['font family name', /fontFamily:\s*['"]/],
  ['font size', /fontSize:\s*\d/],
  // A plain 0 (no border, no gap) is not a design size; anything else must come from tokens.
  ['numeric size', new RegExp(String.raw`\b(?:${SIZE_KEYS}):\s*-?(?:[1-9]|0\.\d)`)],
];

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

for (const file of files) {
  test(`src/ui/${file} uses tokens only`, () => {
    const source = stripComments(readFileSync(new URL(file, dir), 'utf8'));
    for (const [name, pattern] of RULES) assert.doesNotMatch(source, pattern, name);
  });
}

test('there are UI files to check', () => {
  assert.ok(files.length >= 12);
});

test('the rules do catch violations (and allow token usage)', () => {
  const violations = [
    'const s = { height: 52 };',
    'const s = { paddingHorizontal: 16 };',
    'const s = { borderRadius: 12 };',
    'const s = { gap: 8 };',
    'const s = { borderBottomWidth: 1 };',
    'const s = { fontSize: 16 };',
    "const s = { color: '#FFFFFF' };",
    'const s = { color: "rgba(0,0,0,0.5)" };',
    "const s = { fontFamily: 'Inter' };",
  ];
  for (const code of violations) {
    assert.ok(
      RULES.some(([, pattern]) => pattern.test(code)),
      `not caught: ${code}`,
    );
  }
  const clean = [
    'const s = { height: layout.buttonHeight };',
    "const s = { width: '100%', flex: 1, opacity: 0.4 };",
    'const s = { padding: spacing.md, gap: spacing.xs };',
  ];
  for (const code of clean) {
    assert.ok(!RULES.some(([, pattern]) => pattern.test(code)), `wrongly flagged: ${code}`);
  }
});
