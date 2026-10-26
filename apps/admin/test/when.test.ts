import assert from 'node:assert/strict';
import { test } from 'node:test';
import { whenLabel } from '../src/lib/when';

// "Now" is 2026-10-26 12:00 in Ulaanbaatar (UTC+8) = 04:00 UTC.
const now = Date.parse('2026-10-26T04:00:00Z');
const at = (local: string) => `${local}+08:00`;

test('today, tomorrow and yesterday are words with the time', () => {
  assert.equal(whenLabel(at('2026-10-26T18:30:00'), now).text, 'өнөөдөр 18:30');
  assert.equal(whenLabel(at('2026-10-27T08:56:00'), now).text, 'маргааш 08:56');
  assert.equal(whenLabel(at('2026-10-25T23:59:00'), now).text, 'өчигдөр 23:59');
});

test('the day follows Ulaanbaatar, not UTC: 00:30 tomorrow is still tomorrow', () => {
  // 2026-10-26T16:30Z is 2026-10-27 00:30 in Ulaanbaatar
  assert.equal(whenLabel('2026-10-26T16:30:00Z', now).text, 'маргааш 00:30');
});

test('up to 7 days away counts days; further away is only the date', () => {
  assert.equal(whenLabel(at('2026-10-29T09:00:00'), now).text, '3 хоногийн дараа 09:00');
  assert.equal(whenLabel(at('2026-10-21T09:00:00'), now).text, '5 хоногийн өмнө 09:00');
  assert.equal(whenLabel(at('2026-11-02T09:00:00'), now).text, '7 хоногийн дараа 09:00');
  assert.equal(whenLabel(at('2026-11-03T09:00:00'), now).text, '2026.11.03');
  assert.equal(whenLabel(at('2026-10-01T09:00:00'), now).text, '2026.10.01');
});

test('the tooltip is always the full date and time', () => {
  assert.equal(whenLabel(at('2026-10-27T08:56:00'), now).title, '2026.10.27 08:56');
  assert.equal(whenLabel(at('2026-12-01T08:56:00'), now).title, '2026.12.01 08:56');
});
