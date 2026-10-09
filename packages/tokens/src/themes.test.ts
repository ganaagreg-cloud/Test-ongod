import assert from 'node:assert/strict';
import { test } from 'node:test';
import { themes, type ThemeColors } from './index';

test('every theme has the same keys', () => {
  const keys = (name: keyof typeof themes) => Object.keys(themes[name]).sort();
  assert.deepEqual(keys('light'), keys('dark'));
  assert.deepEqual(keys('cream'), keys('dark'));
});

test('every theme value is a non-empty string', () => {
  for (const [name, theme] of Object.entries(themes)) {
    for (const [key, value] of Object.entries(theme)) {
      assert.ok(typeof value === 'string' && value.length > 0, `${name}.${key} is empty`);
    }
  }
});

/** WCAG relative luminance contrast of two #RRGGBB colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const AA = 4.5;
const pairs = (
  t: ThemeColors,
  name: string,
  list: Array<[keyof ThemeColors, keyof ThemeColors]>,
) => {
  for (const [fg, bg] of list) {
    const ratio = contrast(t[fg], t[bg]);
    assert.ok(ratio >= AA, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${AA}`);
  }
};

test('dark forest text passes WCAG AA', () => {
  pairs(themes.dark, 'dark', [
    ['textPrimary', 'surfaceRaised'],
    ['textSecondary', 'surfaceRaised'],
    ['textSecondary', 'brand'],
    ['textTertiary', 'surfaceRaised'],
    ['onAccent', 'accent'],
    ['textPrimary', 'heritage'],
  ]);
});

test('cream text passes WCAG AA; ink and ink 2 meet the ADR-0028 numbers', () => {
  pairs(themes.cream, 'cream', [
    ['textPrimary', 'bg'],
    ['textPrimary', 'surface'],
    ['textSecondary', 'bg'],
    ['textTertiary', 'bg'],
    ['textTertiary', 'surfaceSunken'],
    ['onPrimary', 'primary'],
    ['onAccent', 'accent'],
  ]);
  assert.ok(contrast(themes.cream.textPrimary, themes.cream.bg) >= 10.5);
  assert.ok(contrast(themes.cream.textSecondary, themes.cream.bg) >= 5.5);
});

test('gold is never text on cream', () => {
  assert.notEqual(themes.cream.accentText.toLowerCase(), themes.cream.accent.toLowerCase());
  assert.ok(contrast(themes.cream.accentText, themes.cream.bg) >= AA);
});
