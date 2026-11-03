import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuditEntryDto } from '@ongod/shared';
import { DAY_MS, accessState, auditOf, isValidGrantDays, previewPeriod } from '../src/lib/access';

const now = Date.parse('2026-10-31T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

test('access state: none, expired and active are told apart', () => {
  assert.equal(accessState(null, now), 'NONE');
  assert.equal(accessState(iso(now - 1), now), 'EXPIRED');
  assert.equal(accessState(iso(now), now), 'EXPIRED', 'ends exactly now: no access');
  assert.equal(accessState(iso(now + 1), now), 'ACTIVE');
});

test('grant days must be a whole number from 1 to 3660', () => {
  for (const ok of [1, 30, 3660]) assert.equal(isValidGrantDays(ok), true);
  for (const bad of [0, -1, 1.5, 3661, Number.NaN, undefined]) {
    assert.equal(isValidGrantDays(bad), false, String(bad));
  }
});

test('preview: no access or expired access starts now', () => {
  for (const until of [null, iso(now - DAY_MS)]) {
    const period = previewPeriod(now, until, 30);
    assert.deepEqual(period, { start: now, end: now + 30 * DAY_MS, extends: false });
  }
});

test('preview: active access is extended from its end, without overlap', () => {
  const end = now + 10 * DAY_MS;
  const period = previewPeriod(now, iso(end), 30);
  assert.deepEqual(period, { start: end, end: end + 30 * DAY_MS, extends: true });
});

test('preview: an invalid duration gives no dates', () => {
  assert.equal(previewPeriod(now, null, 0), null);
  assert.equal(previewPeriod(now, null, 4000), null);
  assert.equal(previewPeriod(now, null, undefined), null);
});

const entry = (
  over: Partial<AuditEntryDto> & Pick<AuditEntryDto, 'action' | 'targetId'>,
): AuditEntryDto => ({
  id: `a-${over.action}-${over.targetId}`,
  actor: { id: 'u1', username: 'ganaa' },
  targetType: 'Subscription',
  data: {},
  createdAt: iso(now),
  ...over,
});

test('audit: the grant admin and note, and the revoke admin and reason, come from the log', () => {
  const log = [
    entry({ action: 'subscription.grant', targetId: 's1', data: { note: ' бэлэг ', days: 30 } }),
    entry({
      action: 'subscription.revoke',
      targetId: 's1',
      actor: { id: 'u2', username: 'bold' },
      data: { reason: 'буцаалт', refund: true },
    }),
    entry({ action: 'subscription.grant', targetId: 's2', data: { note: null } }),
  ];
  const s1 = auditOf(log, 's1');
  assert.equal(s1.grant?.admin, 'ganaa');
  assert.equal(s1.grant?.note, ' бэлэг ');
  assert.deepEqual(
    [s1.revoke?.admin, s1.revoke?.reason, s1.revoke?.refund],
    ['bold', 'буцаалт', true],
  );
  const s2 = auditOf(log, 's2');
  assert.equal(s2.grant?.note, null);
  assert.equal(s2.revoke, null);
});

test('audit: a subscription with no entry has no grant or revoke, nothing is guessed', () => {
  const log = [entry({ action: 'device.remove', targetId: 'u1', targetType: 'User' })];
  assert.deepEqual(auditOf(log, 's9'), { grant: null, revoke: null });
  assert.deepEqual(
    auditOf([entry({ action: 'subscription.grant', targetId: 's9', data: 'x' })], 's9').grant?.note,
    null,
  );
});
