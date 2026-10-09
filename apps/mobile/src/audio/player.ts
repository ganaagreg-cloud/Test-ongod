import { useSyncExternalStore } from 'react';
import { api } from '../api';
import { createPlayerController, type PlayerState } from './controller';
import { engine } from './engine';

/**
 * The one player of the app (the OS gives the lock screen to one player only, ADR-0032): the
 * native engine + the signed play URL + progress saving, shared by the mini player and the player
 * sheet. Screens call `player.open(...)`, `player.toggle()`, `player.cycleRate()` ... and read the
 * state with `usePlayerState()`.
 */
export const player = createPlayerController({
  engine,
  fetchPlay: (episodeId) => api.playEpisode(episodeId),
  saveProgress: (episodeId, body) => api.saveProgress(episodeId, body),
});

let snapshot: PlayerState = player.getState();
player.onChange((next) => {
  snapshot = next;
});

/** React state of the player; re-renders about twice a second while playing. */
export function usePlayerState(): PlayerState {
  return useSyncExternalStore(
    (notify) => player.onChange(notify),
    () => snapshot,
    () => snapshot,
  );
}
