import assert from 'node:assert/strict';
import { test } from 'node:test';
import { episodeIdOf, nextStep, pushAvailable, type PermissionState } from '../src/push/rules';

// ADR-0055: when the app registers for push, when it asks, and what a tap opens.

const phone = { os: 'ios', isDevice: true, isExpoGo: false, projectId: 'eas-project' };

test('push needs a real phone, a dev or store build and an EAS project', () => {
  assert.equal(pushAvailable(phone), true);
  assert.equal(pushAvailable({ ...phone, os: 'android' }), true);
  assert.equal(pushAvailable({ ...phone, os: 'web' }), false);
  assert.equal(pushAvailable({ ...phone, isDevice: false }), false);
  assert.equal(pushAvailable({ ...phone, isExpoGo: true }), false);
  assert.equal(pushAvailable({ ...phone, projectId: undefined }), false);
  assert.equal(pushAvailable({ ...phone, projectId: '' }), false);
});

const granted: PermissionState = { granted: true, status: 'granted', canAskAgain: true };
const never: PermissionState = { granted: false, status: 'undetermined', canAskAgain: true };
const deniedOnce: PermissionState = { granted: false, status: 'denied', canAskAgain: true };
const blocked: PermissionState = { granted: false, status: 'denied', canAskAgain: false };

test('on a signed-in start: register when allowed, ask only if the system never asked', () => {
  const start = { optedOut: false, trigger: 'start' } as const;
  assert.equal(nextStep(granted, start), 'register');
  assert.equal(nextStep(never, start), 'ask');
  // A "no" is respected: no prompt again on later starts.
  assert.equal(nextStep(deniedOnce, start), 'skip');
  assert.equal(nextStep(blocked, start), 'skip');
});

test('switched off on this phone: nothing at all, even with permission', () => {
  for (const p of [granted, never, deniedOnce, blocked]) {
    assert.equal(nextStep(p, { optedOut: true, trigger: 'start' }), 'skip');
  }
});

test('the switch asks again when the system allows it, otherwise it is blocked', () => {
  const sw = { optedOut: false, trigger: 'switch' } as const;
  assert.equal(nextStep(granted, sw), 'register');
  assert.equal(nextStep(never, sw), 'ask');
  assert.equal(nextStep(deniedOnce, sw), 'ask');
  assert.equal(nextStep(blocked, sw), 'blocked');
});

test('a tap opens the episode only for a plain episode id', () => {
  assert.equal(episodeIdOf({ episodeId: 'ep_1' }), 'ep_1');
  assert.equal(episodeIdOf({ type: 'access_ending' }), undefined);
  assert.equal(episodeIdOf({ episodeId: '' }), undefined);
  assert.equal(episodeIdOf({ episodeId: 7 }), undefined);
  assert.equal(episodeIdOf({ episodeId: 'x'.repeat(65) }), undefined);
  assert.equal(episodeIdOf(null), undefined);
  assert.equal(episodeIdOf('ep_1'), undefined);
});
