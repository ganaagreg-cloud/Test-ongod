import assert from 'node:assert/strict';
import { test } from 'node:test';
import { themes } from './index';

test('dark and light themes have the same keys', () => {
  const keys = (name: keyof typeof themes) => Object.keys(themes[name]).sort();
  assert.deepEqual(keys('light'), keys('dark'));
});

test('every theme value is a non-empty string', () => {
  for (const [name, theme] of Object.entries(themes)) {
    for (const [key, value] of Object.entries(theme)) {
      assert.ok(typeof value === 'string' && value.length > 0, `${name}.${key} is empty`);
    }
  }
});
