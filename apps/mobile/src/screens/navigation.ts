import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/** Opens the Player sheet for an episode; `autoplay` starts it (play buttons, "Үргэлжлүүлэх"). */
export function openPlayer(router: Router, id: string, autoplay = false) {
  router.push({ pathname: '/player/[id]', params: autoplay ? { id, autoplay: '1' } : { id } });
}

/** Сан, optionally filtered to one category (category cards, "Бүгд ›"). */
export function openLibrary(router: Router, category?: string) {
  router.navigate({ pathname: '/library', params: category ? { category } : {} });
}
