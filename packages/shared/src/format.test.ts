import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDurationMn, planLength } from './format';

test('formats episode lengths in Mongolian', () => {
  assert.equal(formatDurationMn(0), '1 мин');
  assert.equal(formatDurationMn(29), '1 мин');
  assert.equal(formatDurationMn(32 * 60), '32 мин');
  assert.equal(formatDurationMn(59 * 60 + 40), '1 цаг');
  assert.equal(formatDurationMn(3600), '1 цаг');
  assert.equal(formatDurationMn(3600 + 5 * 60), '1 цаг 05 мин');
  assert.equal(formatDurationMn(2 * 3600 + 30 * 60), '2 цаг 30 мин');
});

test('plan lengths read as months and years', () => {
  assert.deepEqual(planLength(30), { unit: 'month', count: 1 });
  assert.deepEqual(planLength(31), { unit: 'month', count: 1 });
  assert.deepEqual(planLength(90), { unit: 'month', count: 3 });
  assert.deepEqual(planLength(365), { unit: 'year', count: 1 });
  assert.deepEqual(planLength(366), { unit: 'year', count: 1 });
  assert.deepEqual(planLength(730), { unit: 'year', count: 2 });
  assert.deepEqual(planLength(731), { unit: 'year', count: 2 });
  assert.deepEqual(planLength(7), { unit: 'day', count: 7 });
  assert.deepEqual(planLength(45), { unit: 'day', count: 45 });
  assert.deepEqual(planLength(400), { unit: 'day', count: 400 });
});
