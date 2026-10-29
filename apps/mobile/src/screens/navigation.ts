import type { useRouter } from 'expo-router';
import type { EpisodeItem } from '@ongod/shared';
import { setPlayQueue } from '../playback/queue';

type Router = ReturnType<typeof useRouter>;

/**
 * Opens the Player sheet for an episode; `autoplay` starts it (play buttons, "Үргэлжлүүлэх").
 * `list` is the ordered list it was opened from: "Дараагийн" is the item after it (ADR-0049).
 */
export function openPlayer(
  router: Router,
  id: string,
  autoplay = false,
  list: readonly EpisodeItem[] = [],
) {
  setPlayQueue(list);
  router.push({ pathname: '/player/[id]', params: autoplay ? { id, autoplay: '1' } : { id } });
}

/** The series page: cover, description and its parts. */
export function openSeries(router: Router, id: string) {
  router.push({ pathname: '/series/[id]', params: { id } });
}

/** A playlist page (a home row's "Бүгд ›"). */
export function openPlaylist(router: Router, id: string) {
  router.push({ pathname: '/playlist/[id]', params: { id } });
}

/** Сан, optionally filtered to one category (category cards, "Бүгд ›"). */
export function openLibrary(router: Router, category?: string) {
  router.navigate({ pathname: '/library', params: category ? { category } : {} });
}
