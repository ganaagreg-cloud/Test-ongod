import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDurationMn } from './format';

test('formats episode lengths in Mongolian', () => {
  assert.equal(formatDurationMn(0), '1 мин');
  assert.equal(formatDurationMn(29), '1 мин');
  assert.equal(formatDurationMn(32 * 60), '32 мин');
  assert.equal(formatDurationMn(59 * 60 + 40), '1 цаг');
  assert.equal(formatDurationMn(3600), '1 цаг');
  assert.equal(formatDurationMn(3600 + 5 * 60), '1 цаг 05 мин');
  assert.equal(formatDurationMn(2 * 3600 + 30 * 60), '2 цаг 30 мин');
});
