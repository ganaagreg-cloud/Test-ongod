import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMENT_MAX_LENGTH } from '@ongod/shared';
import { createEndpoints } from '../src/api/endpoints';
import { mn } from '../src/i18n/mn';
import { canSendComment, commentCharsLeft, commentsSummary } from '../src/lib/comments';

// The rules behind the comment box (SPEC L, ADR-0061), without a phone.

test('a comment is sendable when it has text and is not over the limit', () => {
  assert.equal(canSendComment(''), false);
  assert.equal(canSendComment('   \n '), false);
  assert.equal(canSendComment('Сайн байна'), true);
  assert.equal(canSendComment('a'.repeat(COMMENT_MAX_LENGTH)), true);
  assert.equal(canSendComment('a'.repeat(COMMENT_MAX_LENGTH + 1)), false);
});

test('the characters-left counter shows only near the limit', () => {
  assert.equal(commentCharsLeft('short'), null);
  assert.equal(commentCharsLeft('a'.repeat(COMMENT_MAX_LENGTH - 100)), 100);
  assert.equal(commentCharsLeft('a'.repeat(COMMENT_MAX_LENGTH)), 0);
});

test('the comment calls go to the right addresses', async () => {
  const seen: Array<[string, string, unknown]> = [];
  const client = {
    request: async (path: string, init: { method?: string; body?: unknown }) => {
      seen.push([init.method ?? 'GET', path, init.body]);
      return undefined;
    },
    getRefreshToken: async () => null,
  } as unknown as Parameters<typeof createEndpoints>[0];
  const api = createEndpoints(client);
  // The schemas reject the empty answer of the fake client; the calls were still made.
  const attempt = (call: Promise<unknown>) => call.catch(() => undefined);
  await attempt(api.comments('ep 1'));
  await attempt(api.comments('ep1', 'c2'));
  await attempt(api.postComment('ep1', 'Сайн'));
  await attempt(api.editComment('c1', 'Засав'));
  await attempt(api.deleteComment('c1'));
  await attempt(api.reportComment('c1', 'SPAM'));
  await attempt(api.blockCommentAuthor('c1'));
  await attempt(api.blockedUsers());
  await attempt(api.unblockUser('u1'));
  assert.deepEqual(seen, [
    ['GET', '/episodes/ep%201/comments', undefined],
    ['GET', '/episodes/ep1/comments?cursor=c2', undefined],
    ['POST', '/episodes/ep1/comments', { body: 'Сайн' }],
    ['PATCH', '/comments/c1', { body: 'Засав' }],
    ['DELETE', '/comments/c1', undefined],
    ['POST', '/comments/c1/report', { reason: 'SPAM' }],
    ['POST', '/comments/c1/block', undefined],
    ['GET', '/me/blocks', undefined],
    ['DELETE', '/me/blocks/u1', undefined],
  ]);
});

test('every report reason has a Mongolian label', () => {
  for (const reason of ['SPAM', 'ABUSE', 'OTHER'] as const) {
    assert.ok(mn.comments.reasons[reason].length > 0);
  }
});

test('an app-config answer without supportEmail (an older server) still parses, as null', async () => {
  const { appConfigResponseSchema } = await import('@ongod/shared');
  const parsed = appConfigResponseSchema.parse({
    minVersion: { ios: '99.0.0', android: '99.0.0' },
    socialLogin: false,
  });
  assert.equal(parsed.supportEmail, null);
  assert.equal(parsed.minVersion.ios, '99.0.0');
});

test('the Player card takes the total and the newest comment from the first page', () => {
  const comment = (id: string) => ({
    id,
    authorName: 'Бат Э.',
    authorId: 'u1',
    body: id,
    mine: false,
    edited: false,
    createdAt: '2026-10-30T00:00:00.000Z',
  });
  const page = (ids: string[], total: number) => ({
    items: ids.map(comment),
    nextCursor: null,
    total,
    canComment: true,
  });
  assert.deepEqual(commentsSummary([]), { total: 0, newest: null });
  assert.deepEqual(commentsSummary([page([], 0)]), { total: 0, newest: null });
  const summary = commentsSummary([page(['c3', 'c2'], 3), page(['c1'], 3)]);
  assert.equal(summary.total, 3);
  assert.equal(summary.newest?.id, 'c3');
});
