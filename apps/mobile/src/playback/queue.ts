import type { EpisodeItem } from '@ongod/shared';

// The list the member opened the Player from (ADR-0049). Memory only: after a restart, a push
// notification or the mini player there is none, and the Player falls back to the API's order.
let queue: readonly EpisodeItem[] = [];

/** Called by every screen that opens the Player; `[]` forgets the old list. */
export function setPlayQueue(items: readonly EpisodeItem[]) {
  queue = items;
}

/**
 * The item after `id` in the opening list. `undefined`: `id` is not in it (no answer);
 * `null`: it is the last one (nothing next).
 */
export function nextInQueue(id: string): EpisodeItem | null | undefined {
  const index = queue.findIndex((item) => item.id === id);
  if (index < 0) return undefined;
  return queue[index + 1] ?? null;
}
