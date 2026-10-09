import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBelowMinVersion, parseVersion } from '../src/lib/version';

// SPEC I: below the minimum version the app shows a blocking "update required" screen.

test('versions are compared number by number, not as text', () => {
  assert.equal(isBelowMinVersion('0.9.0', '1.0.0'), true);
  assert.equal(isBelowMinVersion('1.2.9', '1.3.0'), true);
  assert.equal(isBelowMinVersion('1.0.9', '1.0.10'), true); // "9" < "10" as numbers
  assert.equal(isBelowMinVersion('1.10.0', '1.9.0'), false);
});

test('the minimum itself and anything newer is fine', () => {
  assert.equal(isBelowMinVersion('1.0.0', '1.0.0'), false);
  assert.equal(isBelowMinVersion('2.0.0', '1.99.99'), false);
});

test('an unreadable installed version never locks the app', () => {
  assert.equal(isBelowMinVersion(null, '1.0.0'), false);
  assert.equal(isBelowMinVersion(undefined, '1.0.0'), false);
  assert.equal(isBelowMinVersion('dev', '1.0.0'), false);
});

test('an unreadable minimum never locks the app', () => {
  assert.equal(isBelowMinVersion('1.0.0', 'x'), false);
});

test('build suffixes are ignored', () => {
  assert.deepEqual(parseVersion('1.4.0-beta.1'), [1, 4, 0]);
  assert.equal(parseVersion('1.4'), undefined);
});
