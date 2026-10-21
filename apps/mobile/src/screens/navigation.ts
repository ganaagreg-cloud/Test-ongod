import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/** Opens the Player sheet for an episode; `autoplay` starts it (play buttons, "Үргэлжлүүлэх"). */
export function openPlayer(router: Router, id: string, autoplay = false) {
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
