import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EpisodeItem } from '@ongod/shared';
import { nextRows } from '../src/playback/queue';

// The rows under "Дараагийн" in the Player (ADR-0067).
const ep = (id: string) => ({ id }) as EpisodeItem;
const ids = (items: EpisodeItem[]) => items.map((e) => e.id);

test('the next item comes first, then the rest of the category without repeats', () => {
  const rows = nextRows(ep('b'), 'a', [ep('b'), ep('c'), ep('a'), ep('d')], 4);
  assert.deepEqual(ids(rows), ['b', 'c', 'd']);
});

test('a next item outside the category list still leads the rows', () => {
  assert.deepEqual(ids(nextRows(ep('x'), 'a', [ep('b'), ep('c')], 4)), ['x', 'b', 'c']);
});

test('the rows stop at the limit', () => {
  const rows = nextRows(ep('b'), 'a', [ep('c'), ep('d'), ep('e'), ep('f')], 3);
  assert.deepEqual(ids(rows), ['b', 'c', 'd']);
});

test('nothing next means no rows', () => {
  assert.deepEqual(nextRows(null, 'a', [ep('b')], 4), []);
});
