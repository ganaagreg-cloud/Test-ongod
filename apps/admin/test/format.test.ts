import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import {
  formatBytes,
  formatDuration,
  formatMnt,
  suggestSlug,
  toUlaanbaatarInputValue,
  toUlaanbaatarIso,
  ulaanbaatarInputToDate,
} from '../src/lib/format';

// The schedule picker (SPEC G): what the owner types is Ulaanbaatar wall-clock time (UTC+8),
// whatever the computer's own time zone is.

test('a picked time is read as Ulaanbaatar time', () => {
  assert.equal(
    ulaanbaatarInputToDate('2026-10-20T09:00')?.toISOString(),
    '2026-10-20T01:00:00.000Z',
  );
  // across midnight in both directions
  assert.equal(
    ulaanbaatarInputToDate('2026-10-20T00:30')?.toISOString(),
    '2026-10-19T16:30:00.000Z',
  );
  assert.equal(
    ulaanbaatarInputToDate('2026-12-31T23:59')?.toISOString(),
    '2026-12-31T15:59:00.000Z',
  );
});

test('the API gets an instant with the +08:00 offset', () => {
  const date = ulaanbaatarInputToDate('2026-10-20T09:00')!;
  assert.equal(toUlaanbaatarIso(date), '2026-10-20T09:00:00+08:00');
  assert.equal(toUlaanbaatarInputValue(date), '2026-10-20T09:00');
});

test('garbage input gives no date', () => {
  assert.equal(ulaanbaatarInputToDate(''), undefined);
  assert.equal(ulaanbaatarInputToDate('tomorrow'), undefined);
  assert.equal(ulaanbaatarInputToDate('2026-10-20'), undefined);
});

test('the result does not depend on the computer time zone', () => {
  const script = `
    import { toUlaanbaatarIso, ulaanbaatarInputToDate, formatDateTime } from './src/lib/format.ts';
    const d = ulaanbaatarInputToDate('2026-10-20T09:00');
    console.log(JSON.stringify([d.toISOString(), toUlaanbaatarIso(d), formatDateTime(d.toISOString())]));
  `;
  for (const TZ of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, TZ },
        encoding: 'utf8',
      },
    );
    assert.deepEqual(JSON.parse(out), [
      '2026-10-20T01:00:00.000Z',
      '2026-10-20T09:00:00+08:00',
      '2026.10.20 09:00',
    ]);
  }
});

test('category slugs are suggested from Mongolian names', () => {
  assert.equal(suggestSlug('Үлгэр домог'), 'ulger-domog');
  assert.equal(suggestSlug('  Ярилцлага #1 '), 'yariltslaga-1');
  assert.match(suggestSlug('Тест ангилал 12345'), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('numbers read well', () => {
  assert.equal(formatMnt(100000), '100,000₮');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3723), '1:02:03');
});
