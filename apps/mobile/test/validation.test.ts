import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checks, validate } from '../src/auth/validation';
import { mn } from '../src/i18n/mn';

// The forms use the API's own zod schemas, so "valid in the app" means "valid for the server".

test('email', () => {
  assert.equal(checks.email('bat@example.com'), undefined);
  assert.equal(checks.email('  Bat@Example.com '), undefined);
  assert.equal(checks.email('bat@'), mn.errors.email);
  assert.equal(checks.email(''), mn.errors.required);
});

test('phone', () => {
  assert.equal(checks.phone('99112233'), undefined);
  assert.equal(checks.phone('+976 9911-2233'), undefined);
  assert.equal(checks.phone('abc'), mn.errors.phone);
  assert.equal(checks.phone(''), mn.errors.required);
});

test('password needs 8 characters', () => {
  assert.equal(checks.password('1234567'), mn.errors.password);
  assert.equal(checks.password('12345678'), undefined);
});

test('the email code has exactly 6 digits', () => {
  assert.equal(checks.code('123456'), undefined);
  assert.equal(checks.code('12345'), mn.errors.code);
  assert.equal(checks.code('12345a'), mn.errors.code);
});

test('username: 3-30 simple characters, or an email; optional at registration', () => {
  assert.equal(checks.username('bat.erdene'), undefined);
  assert.equal(checks.username('bat@example.com'), undefined);
  assert.equal(checks.username('ab'), mn.errors.username);
  assert.equal(checks.username('Bat Erdene'), mn.errors.username);
  assert.equal(checks.optionalUsername(''), undefined);
  assert.equal(checks.optionalUsername('ab'), mn.errors.username);
});

test('validate collects the errors by field', () => {
  const errors = validate(
    { email: 'x', password: '12345678' },
    { email: checks.email, password: checks.password },
  );
  assert.deepEqual(errors, { email: mn.errors.email });
});
