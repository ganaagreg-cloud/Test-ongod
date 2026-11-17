import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// ADR-0109: the store build has no payment code. Metro replaces src/inpay and src/testpay with a
// stub unless EXPO_PUBLIC_PAYMENTS_CODE=true, so a server setting can never turn them on.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('metro.config.js stubs the payment folders unless the build asks for them', () => {
  const metro = read('../metro.config.js');
  assert.match(metro, /EXPO_PUBLIC_PAYMENTS_CODE !== 'true'/);
  assert.match(metro, /inpay\|testpay/);
  assert.ok(existsSync(new URL('../src/payments-off.js', import.meta.url)), 'the stub exists');
});

test('no EAS build profile turns the payment code on', () => {
  const eas = read('../eas.json');
  assert.doesNotMatch(eas, /EXPO_PUBLIC_PAYMENTS_CODE/);
});
