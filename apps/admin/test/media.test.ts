import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AdminEpisodeDto } from '@ongod/shared';
import {
  isStuckUpload,
  startingCategory,
  STUCK_UPLOAD_MS,
  titleFromFileName,
} from '../src/lib/media';

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

test('a title comes from the file name without the extension', () => {
  assert.equal(
    titleFromFileName('Малчин өвөөгийн яриа 3-р анги.mp3'),
    'Малчин өвөөгийн яриа 3-р анги',
  );
  assert.equal(titleFromFileName('ep_04__final  cut.MP4'), 'ep 04 final cut');
  assert.equal(titleFromFileName('.mp3'), '.mp3');
  assert.equal(titleFromFileName('no-extension'), 'no-extension');
  assert.equal(titleFromFileName(`${'а'.repeat(250)}.mp3`).length, 200);
});

test('a new item starts with the last category, or the only one', () => {
  assert.equal(startingCategory(['a', 'b'], 'b'), 'b');
  assert.equal(startingCategory(['a', 'b'], 'gone'), '');
  assert.equal(startingCategory(['a', 'b'], null), '');
  assert.equal(startingCategory(['a'], null), 'a');
  assert.equal(startingCategory([], 'a'), '');
});
