import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EpisodeItem, EpisodesPage, HomeResponse } from '@ongod/shared';
import { createEndpoints, queryString } from '../src/api/endpoints';
import { mn } from '../src/i18n/mn';
import { homeRows } from '../src/screens/home/homeRows';
import {
  accessState,
  clockLabel,
  countdown,
  dayTile,
  durationBadge,
  episodeMeta,
  greeting,
  listenedHours,
  pagesWithSaved,
  progressFraction,
  remainingLabel,
  resumeAt,
  rowProgress,
  withSaved,
} from '../src/lib/episode';

// The rules behind the phase 3 screens (ADR-0039), without a phone: labels, progress, the
// countdown, access, the bookmark in cached lists, and the API calls the screens make.

const DAY = 24 * 60 * 60_000;

const episode = (over: Partial<EpisodeItem> = {}): EpisodeItem => ({
  id: 'ep1',
  title: 'Айдастай нүүр тулах нь',
  category: { id: 'c1', name: 'Сэтгэл зүй', slug: 'psy' },
  coverUrl: null,
  thumbUrl: null,
  durationSec: 2400,
  mediaKind: 'AUDIO',
  publishedAt: '2026-03-01T04:00:00.000Z',
  progress: null,
  saved: false,
  series: null,
  tags: [],
  ...over,
});

test('clock labels: minutes:seconds, hours when needed', () => {
  assert.equal(clockLabel(0), '0:00');
  assert.equal(clockLabel(2172), '36:12');
  assert.equal(clockLabel(4500), '1:15:00');
  assert.equal(clockLabel(-5), '0:00');
  assert.equal(durationBadge({ durationSec: 1680 }), '28:00');
  assert.equal(
    durationBadge({ durationSec: null }),
    undefined,
    'no badge before the file is ready',
  );
});

test('greeting follows the time of day in Ulaanbaatar (UTC+8), not the phone', () => {
  assert.equal(greeting(new Date('2026-10-19T00:30:00Z')), mn.home.greetingMorning); // 08:30
  assert.equal(greeting(new Date('2026-10-19T05:00:00Z')), mn.home.greetingDay); // 13:00
  assert.equal(greeting(new Date('2026-10-19T12:00:00Z')), mn.home.greetingEvening); // 20:00
  assert.equal(greeting(new Date('2026-10-18T20:30:00Z')), mn.home.greetingEvening); // 04:30
});

test('meta line: category and year (Ulaanbaatar), the length when asked', () => {
  // 31 Dec 20:00 UTC is already 1 January in Ulaanbaatar.
  const item = episode({ publishedAt: '2025-12-31T20:00:00.000Z' });
  assert.equal(episodeMeta(item), 'Сэтгэл зүй · 2026');
  assert.equal(episodeMeta(item, true), 'Сэтгэл зүй · 2026 · 40 мин');
});

test('progress: never started, half heard, finished', () => {
  assert.equal(progressFraction(episode()), undefined);
  assert.equal(rowProgress(episode()), undefined);
  const half = episode({ progress: { positionSec: 1200, completed: false } });
  assert.equal(progressFraction(half), 0.5);
  assert.deepEqual(rowProgress(half), { value: 0.5, label: mn.episode.progress(50) });
  assert.equal(remainingLabel(half), mn.home.remaining('20 мин'));
  assert.equal(resumeAt(half), 1200, 'continues where it stopped');
  const done = episode({ progress: { positionSec: 2390, completed: true } });
  assert.deepEqual(rowProgress(done), { value: 1, label: mn.episode.heard });
  assert.equal(resumeAt(done), 0, 'a finished episode starts over');
});

test('countdown to the next release', () => {
  assert.equal(
    countdown(2 * DAY + 14 * 3600_000 + 22 * 60_000 + 9_000),
    mn.home.countdownDays(2, '14:22:09'),
  );
  assert.equal(countdown(59_000), '0:00:59');
  assert.equal(countdown(-1), '0:00:00', 'never negative');
});

test('day tile of the next release, in Ulaanbaatar time', () => {
  // Sunday 25 October 2026, 11:00 in Ulaanbaatar.
  assert.deepEqual(dayTile('2026-10-25T03:00:00.000Z'), { weekday: 'НЯМ', day: '25' });
  // Saturday 22:00 UTC is already Sunday morning in Ulaanbaatar.
  assert.deepEqual(dayTile('2026-10-24T22:00:00.000Z'), { weekday: 'НЯМ', day: '25' });
});

test('access: inactive without an end date or after it, days left while active', () => {
  const now = new Date('2026-10-19T00:00:00.000Z');
  assert.deepEqual(accessState(null, now), { active: false, daysLeft: 0, fraction: 0 });
  assert.deepEqual(accessState('2026-10-01T00:00:00.000Z', now), {
    active: false,
    daysLeft: 0,
    fraction: 0,
  });
  const month = accessState(new Date(now.getTime() + 30 * DAY).toISOString(), now);
  assert.equal(month.active, true);
  assert.equal(month.daysLeft, 30);
  assert.equal(month.fraction, 30 / 365);
  const hours = accessState(new Date(now.getTime() + 3 * 3600_000).toISOString(), now);
  assert.equal(hours.daysLeft, 1, 'a few hours left still counts as a day');
  assert.equal(accessState(new Date(now.getTime() + 800 * DAY).toISOString(), now).fraction, 1);
});

test('listening hours are whole hours', () => {
  assert.equal(listenedHours(0), 0);
  assert.equal(listenedHours(5400), 2);
  assert.equal(listenedHours(36_000), 10);
});

test('the bookmark changes in every cached list; Хадгалсан drops an unsaved one', () => {
  const a = episode({ id: 'a' });
  const b = episode({ id: 'b', saved: true });
  assert.deepEqual(
    withSaved([a, b], 'a', true).map((e) => e.saved),
    [true, true],
  );
  const data = { pages: [{ items: [a, b], nextCursor: null }] as EpisodesPage[], pageParams: [] };
  assert.deepEqual(
    pagesWithSaved(data, 'b', false).pages[0]!.items.map((e) => [e.id, e.saved]),
    [
      ['a', false],
      ['b', false],
    ],
  );
  assert.deepEqual(
    pagesWithSaved(data, 'b', false, true).pages[0]!.items.map((e) => e.id),
    ['a'],
    'removed from the saved list',
  );
  assert.equal(data.pages[0]!.items[1]!.saved, true, 'the cached data is not changed in place');
});

test('library query string: only the set values, encoded', () => {
  assert.equal(queryString({}), '');
  assert.equal(
    queryString({ category: 'psy', q: 'айдас нүүр', sort: 'newest', cursor: undefined, limit: 20 }),
    '?category=psy&q=%D0%B0%D0%B9%D0%B4%D0%B0%D1%81%20%D0%BD%D2%AF%D2%AF%D1%80&sort=newest&limit=20',
  );
});

test('the phase 3 screens call the right endpoints, and none for payments', async () => {
  const seen: Array<[string | undefined, string, unknown]> = [];
  const client = {
    request: async (path: string, options: { method?: string; body?: unknown } = {}) => {
      seen.push([options.method ?? 'GET', path, options.body]);
      return undefined;
    },
    getRefreshToken: async () => null,
  } as unknown as Parameters<typeof createEndpoints>[0];
  const api = createEndpoints(client);
  await api.home();
  await api.categories();
  await api.episodes({ category: 'psy', sort: 'longest', cursor: 'c2' });
  await api.episode('ep 1');
  await api.saved();
  await api.save('ep1');
  await api.unsave('ep1');
  await api.stats();
  await api.updateProfile({ firstName: 'Болд' });
  await api.changePassword({ currentPassword: 'old-pass-1', newPassword: 'new-pass-22' });
  await api.changeEmail({ newEmail: 'new@example.com', password: 'pw-123456' });
  await api.verifyEmailChange('123456');
  await api.devices();
  await api.removeDevice('d1', 'pw-123456');
  await api.deleteAccount();
  assert.deepEqual(seen, [
    ['GET', '/home', undefined],
    ['GET', '/categories', undefined],
    ['GET', '/episodes?category=psy&sort=longest&cursor=c2', undefined],
    ['GET', '/episodes/ep%201', undefined],
    ['GET', '/saved', undefined],
    ['PUT', '/saved/ep1', undefined],
    ['DELETE', '/saved/ep1', undefined],
    ['GET', '/me/stats', undefined],
    ['PATCH', '/me', { firstName: 'Болд' }],
    ['POST', '/me/change-password', { currentPassword: 'old-pass-1', newPassword: 'new-pass-22' }],
    ['POST', '/me/change-email', { newEmail: 'new@example.com', password: 'pw-123456' }],
    ['POST', '/me/change-email/verify', { code: '123456' }],
    ['GET', '/me/devices', undefined],
    ['DELETE', '/me/devices/d1', { password: 'pw-123456' }],
    ['DELETE', '/me', undefined],
  ]);
});

const homeData = (over: Partial<HomeResponse> = {}): HomeResponse => ({
  continueListening: [episode({ id: 'c1' })],
  latest: [episode({ id: 'l1' })],
  categories: [{ id: 'cat1', name: 'Сэтгэл зүй', slug: 'psy', episodeCount: 3, coverUrl: null }],
  thisWeek: [],
  nextRelease: {
    title: 'Дараагийн дугаар',
    category: { id: 'c1', name: 'Сэтгэл зүй', slug: 'psy' },
    scheduledFor: '2026-10-25T04:00:00.000Z',
  },
  featured: [episode({ id: 'f1' })],
  playlists: [
    { id: 'p1', title: 'Эхлэгчдэд', slug: 'starters', items: [episode({ id: 'a' })] },
    { id: 'p2', title: 'Амралтын өдөр', slug: 'weekend', items: [episode({ id: 'b' })] },
  ],
  ...over,
});

test('home rows: featured, continue, this week, playlists, latest, categories in that order', () => {
  const rows = homeRows(homeData(), true);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['featured', 'continue', 'thisWeek', 'playlist', 'playlist', 'latest', 'categories'],
  );
  assert.deepEqual(
    rows.map((r) => r.key),
    ['featured', 'continue', 'thisWeek', 'playlist:p1', 'playlist:p2', 'latest', 'categories'],
  );
  assert.equal(rows[3]!.title, 'Эхлэгчдэд', 'a playlist row is titled by the playlist');
  assert.equal(rows[5]!.title, mn.home.latest);
  assert.equal(rows[6]!.title, mn.home.categories);
});

test('home rows: empty featured, empty playlists and other empty rows are dropped', () => {
  const rows = homeRows(
    homeData({
      featured: [],
      continueListening: [],
      latest: [],
      categories: [],
      nextRelease: null,
      playlists: [
        { id: 'p1', title: 'Хоосон', slug: 'empty', items: [] },
        { id: 'p2', title: 'Амралтын өдөр', slug: 'weekend', items: [episode({ id: 'b' })] },
      ],
    }),
    true,
  );
  assert.deepEqual(
    rows.map((r) => r.key),
    ['playlist:p2'],
  );
});

test('home rows: logged out drops the continue row', () => {
  const kinds = homeRows(homeData(), false).map((r) => r.kind);
  assert.ok(!kinds.includes('continue'));
  assert.ok(kinds.includes('featured'));
});

test('series part label and series/playlist/tag calls', async () => {
  assert.equal(mn.series.part(2), '2-р хэсэг');
  const seen: Array<[string | undefined, string]> = [];
  const client = {
    request: async (path: string, options: { method?: string } = {}) => {
      seen.push([options.method ?? 'GET', path]);
      return undefined;
    },
    getRefreshToken: async () => null,
  } as unknown as Parameters<typeof createEndpoints>[0];
  const api = createEndpoints(client);
  await api.series('s 1');
  await api.playlist('p1');
  await api.tags();
  await api.episodes({ category: 'psy', tag: 'stoic' });
  assert.deepEqual(seen, [
    ['GET', '/series/s%201'],
    ['GET', '/playlists/p1'],
    ['GET', '/tags'],
    ['GET', '/episodes?category=psy&tag=stoic'],
  ]);
});
