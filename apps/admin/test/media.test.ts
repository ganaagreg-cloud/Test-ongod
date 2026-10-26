import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AdminEpisodeDto } from '@ongod/shared';
import { isStuckUpload, STUCK_UPLOAD_MS } from '../src/lib/media';

const media = (status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED', updatedAt: string) =>
  ({
    id: 'm',
    kind: 'AUDIO',
    status,
    failReason: null,
    sizeBytes: null,
    durationSec: null,
    updatedAt,
  }) as NonNullable<AdminEpisodeDto['media']>;

const now = Date.parse('2026-10-26T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

test('an upload is stuck only after more than 15 minutes', () => {
  assert.equal(isStuckUpload(media('UPLOADING', ago(STUCK_UPLOAD_MS - 1000)), now), false);
  assert.equal(isStuckUpload(media('UPLOADING', ago(STUCK_UPLOAD_MS)), now), false);
  assert.equal(isStuckUpload(media('UPLOADING', ago(STUCK_UPLOAD_MS + 1000)), now), true);
});

test('only UPLOADING can be stuck, and no media is never stuck', () => {
  for (const status of ['PROCESSING', 'READY', 'FAILED'] as const) {
    assert.equal(isStuckUpload(media(status, ago(60 * 60_000)), now), false, status);
  }
  assert.equal(isStuckUpload(null, now), false);
});
