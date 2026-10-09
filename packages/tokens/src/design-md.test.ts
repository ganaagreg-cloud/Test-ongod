import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { aspect, glass, layout, motion, radius, spacing, themes, typeScale } from './index';

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
  for (const [, name, value] of radiusLine.matchAll(/(\w+) (\d+)/g)) {
    assert.equal((radius as Record<string, number>)[name!], Number(value), `radius.${name}`);
  }
  assert.deepEqual(
    { ...radius },
    { small: 8, mini: 10, card: 12, thumb: 14, cardLarge: 18, category: 20, hero: 22, sheet: 26, pill: 999 },
  );

  // Components section: heights and sizes.
  assert.equal(layout.buttonHeight, 52);
  assert.equal(layout.inputHeight, 52);
  assert.equal(layout.chipHeight, 36);
  assert.equal(layout.tabBarHeight, 68);
  assert.equal(layout.tabBarInset, 16);
  assert.deepEqual([glass.tabBar, glass.miniPlayer, glass.header], [0.78, 0.82, 0.72]);
  assert.equal(glass.androidOpacity, 0.96);
  assert.match(design, /surfaceRaised at 78%.*mini player \(82%\).*headers \(72%\)/);
  assert.match(design, /Android has no blur: surfaceRaised at 96%/);
  assert.equal(layout.miniPlayerGap, 8);
  assert.equal(layout.miniPlayerCover, 40);
  assert.equal(layout.episodeRowCover, 64);
  assert.equal(layout.touchTarget, 44);
  assert.ok(section('# Components').includes('52 pt tall'));
});

test('cream colors match DESIGN.md "Cream colors"', () => {
  const line = design.match(/^Cream colors[^:]*: (.*)$/m)?.[1];
  assert.ok(line, 'DESIGN.md has a Cream colors line');
  // "name #hex" and "name rgba(...)" pairs; prose in parentheses is skipped by the pattern.
  const spec = new Map(
    [...line.matchAll(/(\w+) (#[0-9A-Fa-f]{6}|rgba\([^)]*\))/g)].map((m) => [m[1]!, m[2]!]),
  );
  assert.ok(spec.size >= 20, 'parsed the cream color list');
  for (const [name, value] of spec) {
    const actual = (themes.cream as Record<string, string>)[name];
    assert.ok(actual, `token ${name} exists`);
    assert.equal(norm(actual), norm(value), `cream.${name}`);
  }
});

test('motion tokens match DESIGN.md "Motion"', () => {
  assert.match(design, /snappy \{damping 18, stiffness 260, mass 0\.8\}/);
  assert.match(design, /smooth \{damping 26, stiffness 180\}/);
  assert.match(design, /sheet \{damping 28, stiffness 220\}/);
  assert.deepEqual({ ...motion.spring.snappy }, { damping: 18, stiffness: 260, mass: 0.8 });
  assert.deepEqual([motion.spring.smooth.damping, motion.spring.smooth.stiffness], [26, 180]);
  assert.deepEqual([motion.spring.sheet.damping, motion.spring.sheet.stiffness], [28, 220]);
  assert.equal(motion.enter.rise, 16);
  assert.equal(motion.enter.staggerMs, 60);
  assert.equal(motion.enter.maxStagger, 8);
  assert.deepEqual([motion.pressScale, motion.pressScaleRound, motion.iconBounce], [0.96, 0.92, 1.12]);
  assert.deepEqual([motion.toastMax, motion.toastOlderScale, motion.toastOlderOpacity], [2, 0.96, 0.7]);
  assert.match(design, /at most 2 at once, 8 pt apart.*96% scale and 70% opacity/);
  assert.equal(spacing.xs, 8);
  assert.equal(motion.shimmerMs, 1200);
  assert.equal(motion.carouselAutoMs, 4800);
  for (const ms of motion.ambientMs) assert.ok(ms >= 12000 && ms <= 19000);
  assert.ok(motion.drawMs <= 1800);
});

test('artwork is 16:9, thumbnails 4:3', () => {
  assert.equal(aspect.artwork, 16 / 9);
  assert.equal(aspect.thumbnail, 4 / 3);
  assert.match(design, /episode pictures are 16:9/);
  assert.match(design, /4:3 center crop \(112×84\)/);
  assert.equal(Math.round(layout.thumbWidth / aspect.thumbnail), 84);
});

test('category card and hero title match the client answers (2026-10-09)', () => {
  assert.equal(layout.categoryCardHeight, 104);
  assert.equal(radius.category, 20);
  assert.deepEqual(
    [typeScale.hero.fontSize, typeScale.hero.lineHeight, typeScale.hero.weight],
    [52, 58, 600],
  );
  assert.deepEqual([typeScale.cardTitle.fontSize, typeScale.cardTitle.lineHeight], [19, 24]);
  assert.match(design, /104 pt tall, full width, radius 20, 12 pt apart/);
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
