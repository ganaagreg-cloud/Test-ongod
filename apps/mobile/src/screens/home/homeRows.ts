// The order and content of Нүүр as plain data, so it is unit-tested (test/screens.test.ts).
// Empty rows are dropped. `loggedIn=false` is for the later logged-out Нүүр: no personal rows.
import type { EpisodeItem, HomeResponse, NextRelease } from '@ongod/shared';
import { mn } from '../../i18n/mn';

type CategoryDto = HomeResponse['categories'][number];

export type HomeRow =
  | { kind: 'featured'; key: string; title: string; items: EpisodeItem[] }
  | { kind: 'continue'; key: string; title: string; items: EpisodeItem[] }
  | { kind: 'thisWeek'; key: string; title: string; release: NextRelease }
  | { kind: 'playlist'; key: string; title: string; id: string; items: EpisodeItem[] }
  | { kind: 'latest'; key: string; title: string; items: EpisodeItem[] }
  | { kind: 'categories'; key: string; title: string; categories: CategoryDto[] };

/** Онцлох, Үргэлжлүүлэх, Энэ 7 хоногт, the home playlists, Шинэ, then the categories. */
export function homeRows(home: HomeResponse, loggedIn: boolean): HomeRow[] {
  const rows: HomeRow[] = [];
  if (home.featured.length > 0) {
    rows.push({ kind: 'featured', key: 'featured', title: mn.home.featured, items: home.featured });
  }
  if (loggedIn && home.continueListening.length > 0) {
    rows.push({
      kind: 'continue',
      key: 'continue',
      title: mn.home.continue,
      items: home.continueListening,
    });
  }
  if (home.nextRelease) {
    rows.push({
      kind: 'thisWeek',
      key: 'thisWeek',
      title: mn.home.thisWeek,
      release: home.nextRelease,
    });
  }
  for (const playlist of home.playlists) {
    if (playlist.items.length === 0) continue;
    rows.push({
      kind: 'playlist',
      key: `playlist:${playlist.id}`,
      title: playlist.title,
      id: playlist.id,
      items: playlist.items,
    });
  }
  if (home.latest.length > 0) {
    rows.push({ kind: 'latest', key: 'latest', title: mn.home.latest, items: home.latest });
  }
  if (home.categories.length > 0) {
    rows.push({
      kind: 'categories',
      key: 'categories',
      title: mn.home.categories,
      categories: home.categories,
    });
  }
  return rows;
}
