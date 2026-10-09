import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { layout, radius, spacing, themes, typeScale } from './index';

// docs/DESIGN.md is the spec; these tests fail if the tokens drift from the numbers written there.
const design = readFileSync(new URL('../../../docs/DESIGN.md', import.meta.url), 'utf8');
const section = (title: string) => {
  const start = design.indexOf(`${title}\n`);
  assert.ok(start >= 0, `DESIGN.md has no "${title}"`);
  return design.slice(start, design.indexOf('\n\n', start + title.length + 2) + 1);
};

const norm = (value: string) => value.replace(/\s/g, '').toLowerCase();

test('dark colors match DESIGN.md "Colors"', () => {
  const colors = design.match(/^Colors: (.*)$/m)?.[1];
  assert.ok(colors, 'DESIGN.md has a Colors line');
  const spec = new Map(
    [...colors.matchAll(/(\w+) (#[0-9A-Fa-f]{6}|rgba\([^)]*\))/g)].map((m) => [m[1]!, m[2]!]),
  );
  assert.ok(spec.size >= 12, 'parsed the color list');
  for (const [name, value] of spec) {
    const actual = (themes.dark as Record<string, string>)[name];
    assert.ok(actual, `token ${name} exists`);
    assert.equal(norm(actual), norm(value), `dark.${name}`);
  }
});

test('type scale matches DESIGN.md "Typography"', () => {
  const line = design.match(/Scale: (.*?)\. Never below 12/)?.[1];
  assert.ok(line, 'DESIGN.md has a Scale line');
  for (const [, name, size, lineHeight] of line.matchAll(/(\w+) (\d+)\/(\d+)/g)) {
    const style = (typeScale as Record<string, { fontSize: number; lineHeight: number }>)[name!];
    assert.ok(style, `type style ${name} exists`);
    assert.equal(style.fontSize, Number(size), `${name} font size`);
    assert.equal(style.lineHeight, Number(lineHeight), `${name} line height`);
  }
  assert.ok(
    Object.values(typeScale).every((s) => s.fontSize >= 12),
    'never below 12',
  );
  assert.equal(typeScale.display.font, 'display');
  assert.equal(typeScale.body.font, 'ui');
});

test('spacing, radius and layout match DESIGN.md', () => {
  const spacingLine = design.match(/^Spacing \(4 pt grid\): ([\d, ]+)\./m)?.[1];
  assert.deepEqual(
    Object.values(spacing),
    spacingLine!.split(',').map((n) => Number(n.trim())),
  );
  assert.equal(layout.screenPadding, 20);

  const radiusLine = design.match(/^Radius: (.*)$/m)?.[1];
  assert.ok(radiusLine);
  assert.equal(radius.small, 8);
  assert.equal(radius.card, 12);
  assert.equal(radius.sheet, 20);
  assert.equal(radius.pill, 999);

  // Components section: heights and sizes.
  assert.equal(layout.buttonHeight, 52);
  assert.equal(layout.inputHeight, 52);
  assert.equal(layout.chipHeight, 36);
  assert.equal(layout.tabBarHeight, 64);
  assert.equal(layout.tabBarInset, 16);
  assert.equal(layout.tabBarBgOpacity, 0.92);
  assert.equal(layout.miniPlayerGap, 8);
  assert.equal(layout.miniPlayerCover, 40);
  assert.equal(layout.episodeRowCover, 64);
  assert.equal(layout.touchTarget, 44);
  assert.ok(section('# Components').includes('52 pt tall'));
});

test('light theme matches DESIGN.md "Light theme colors"', () => {
  const block = design.slice(design.indexOf('Light theme colors'));
  const expected: Record<string, string> = {
    bg: '#F6F4EF',
    surface: '#FFFFFF',
    surfaceSunken: '#EEEBE4',
    textPrimary: '#141A17',
    textSecondary: '#4F5A54',
    textTertiary: '#5F6862',
    accent: '#D4AF6A',
    accentText: '#8A6A2B',
    onAccent: '#14110A',
    primary: '#1F3B2E',
    onPrimary: '#FFFFFF',
    success: '#2E7D43',
    danger: '#C42B31',
    warning: '#8F5B00',
    info: '#2B5FA8',
    focusRing: '#2B5FA8',
  };
  for (const [name, hex] of Object.entries(expected)) {
    assert.ok(block.toLowerCase().includes(hex.toLowerCase()), `DESIGN.md lists ${hex}`);
    assert.equal((themes.light as Record<string, string>)[name], hex, `light.${name}`);
  }
});
