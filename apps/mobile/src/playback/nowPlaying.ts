// The episode the player holds, as the lists showed it (title, category, picture): the mini player
// and the Player screen draw it. Playback itself is src/audio/player.ts.
import { useSyncExternalStore } from 'react';
import type { EpisodeItem } from '@ongod/shared';
import { ApiError } from '../api';
import { player, usePlayerState } from '../audio/player';
import { resumeAt } from '../lib/episode';

let current: EpisodeItem | null = null;
const listeners = new Set<() => void>();

function setCurrent(next: EpisodeItem | null) {
  current = next;
  for (const notify of listeners) notify();
}

const listen = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

/** The loaded episode, or null when nothing is loaded (closed, signed out, refused). */
export function useNowPlaying(): EpisodeItem | null {
  const item = useSyncExternalStore(
    listen,
    () => current,
    () => current,
  );
  const { episodeId } = usePlayerState();
  return item && item.id === episodeId ? item : null;
}

/** Why an episode could not start; `message` is the server's own (Mongolian) text, if any. */
export interface StartFailure {
  reason: 'noAccess' | 'notReady' | 'videoUnsupported' | 'other';
  message?: string | undefined;
}

export function failureOf(error: unknown): StartFailure {
  const code = error instanceof ApiError ? error.code : (error as { code?: unknown }).code;
  if (code === 'NO_ACCESS') return { reason: 'noAccess' };
  if (code === 'MEDIA_NOT_READY' || code === 'NOT_FOUND') return { reason: 'notReady' };
  if (code === 'VIDEO_UNSUPPORTED') return { reason: 'videoUnsupported' };
  // Dev builds show the raw cause in the toast: on a phone there is no console to read.
  const raw = __DEV__ ? String(error) : undefined;
  return { reason: 'other', message: error instanceof ApiError ? error.message : raw };
}

/**
 * Loads an episode and starts it from the saved position. On failure the player is closed (a
 * refused URL must not leave the previous episode half-loaded) and the reason is returned.
 */
export async function startEpisode(item: EpisodeItem): Promise<StartFailure | null> {
  setCurrent(item);
  try {
    await player.open({
      id: item.id,
      title: item.title,
      artist: item.category.name,
      ...(item.coverUrl ? { artworkUrl: item.coverUrl } : {}),
      startAtSec: resumeAt(item),
    });
    return null;
  } catch (error) {
    if (__DEV__) console.warn('startEpisode failed', item.id, error);
    await player.close();
    setCurrent(null);
    return failureOf(error);
  }
}

/** Updates the stored item (e.g. after its bookmark changed) if it is the loaded one. */
export function refreshNowPlaying(item: EpisodeItem) {
  if (current?.id === item.id) setCurrent(item);
}
