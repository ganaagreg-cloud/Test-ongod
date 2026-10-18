// Native (iOS/Android): video episodes through expo-video (ADR-0038, [[R-expo-video-sdk57]]).
// Same AudioEngine shape as the expo-audio engine, so the player controller (progress, speed,
// sleep timer, fresh URLs) works the same for both kinds. The browser preview uses engine.web.ts.
//
// One video player for the whole app (the lock screen belongs to one player). VideoSurface shows
// it; the sound keeps playing when the screen locks or the app goes to the background, with
// lock-screen controls (option A, open question #17). That needs the config plugin option
// `supportsBackgroundPlayback`, so it works in a dev build, not in Expo Go.
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import {
  initialEngineState,
  type AudioEngine,
  type AudioTrack,
  type EngineListener,
  type EngineState,
} from '../audio/types';

/** Position updates every half second, like the audio engine. */
const UPDATE_INTERVAL_SEC = 0.5;
/** Give up on a playlist that never becomes ready. */
const LOAD_TIMEOUT_MS = 30_000;

let player: VideoPlayer | undefined;
let state: EngineState = initialEngineState;
let loaded = false;
let wantsPlay = false;
let hasStarted = false;
let ended = false;
let loadWaiters: Array<{ ok: () => void; fail: (error: Error) => void }> = [];
const listeners = new Set<EngineListener>();
const viewListeners = new Set<() => void>();

function set(patch: Partial<EngineState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/** Resolves (no error) or rejects every load() that waits for the current source. */
function settleLoad(error?: Error) {
  const waiting = loadWaiters;
  loadWaiters = [];
  for (const waiter of waiting) {
    if (error) waiter.fail(error);
    else waiter.ok();
  }
}

function settled(p: VideoPlayer): EngineState['status'] {
  if (ended) return 'ended';
  if (p.playing) return 'playing';
  return hasStarted ? 'paused' : 'ready';
}

function ensurePlayer(): VideoPlayer {
  if (player) return player;
  const p = createVideoPlayer(null);
  p.timeUpdateEventInterval = UPDATE_INTERVAL_SEC;
  p.staysActiveInBackground = true;
  p.showNowPlayingNotification = true;
  p.audioMixingMode = 'doNotMix';

  p.addListener('statusChange', ({ status }) => {
    if (status === 'error') {
      settleLoad(new Error('video could not be loaded'));
      set({ status: 'error', buffering: false });
      return;
    }
    if (status === 'readyToPlay') {
      settleLoad();
      set({
        status: settled(p),
        durationSec: p.duration > 0 ? p.duration : state.durationSec,
        buffering: false,
      });
      return;
    }
    if (status === 'loading') {
      set(wantsPlay && hasStarted ? { buffering: true } : { status: 'loading' });
    }
  });
  p.addListener('playingChange', ({ isPlaying }) => {
    if (isPlaying) {
      hasStarted = true;
      ended = false;
    }
    set({ status: loaded ? settled(p) : state.status });
  });
  p.addListener('timeUpdate', ({ currentTime }) => {
    set({
      positionSec: currentTime,
      durationSec: p.duration > 0 ? p.duration : state.durationSec,
    });
  });
  p.addListener('playbackRateChange', ({ playbackRate }) => set({ rate: playbackRate }));
  p.addListener('playToEnd', () => {
    ended = true;
    wantsPlay = false;
    set({ status: 'ended', buffering: false });
  });

  player = p;
  for (const notify of viewListeners) notify();
  return p;
}

/** The expo-video player for <VideoSurface />; undefined until a video was loaded once. */
export function getVideoPlayer(): VideoPlayer | undefined {
  return player;
}

/** VideoSurface re-renders when the player is first created. */
export function onVideoPlayerCreated(notify: () => void): () => void {
  viewListeners.add(notify);
  return () => {
    viewListeners.delete(notify);
  };
}

export const videoAvailable = true;

export const videoEngine: AudioEngine = {
  async load(track: AudioTrack, startAtSec = 0) {
    const p = ensurePlayer();
    loaded = false;
    wantsPlay = false;
    hasStarted = false;
    ended = false;
    const rate = state.rate;
    set({ status: 'loading', positionSec: startAtSec, durationSec: 0, buffering: false });

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        loadWaiters = loadWaiters.filter((waiter) => waiter.ok !== ok);
        reject(new Error('video load timed out'));
      }, LOAD_TIMEOUT_MS);
      const ok = () => {
        clearTimeout(timer);
        resolve();
      };
      const fail = (error: Error) => {
        clearTimeout(timer);
        reject(error);
      };
      loadWaiters.push({ ok, fail });
    });
    // The signed URL ends in playlist.m3u8; contentType makes iOS treat it as HLS either way.
    // replaceAsync: the synchronous replace blocks the UI on iOS while the playlist is read.
    p.replaceAsync({
      uri: track.url,
      contentType: 'hls',
      metadata: {
        title: track.title,
        ...(track.artist ? { artist: track.artist } : {}),
        ...(track.artworkUrl ? { artwork: track.artworkUrl } : {}),
      },
    }).catch((error: unknown) =>
      settleLoad(error instanceof Error ? error : new Error('video could not be loaded')),
    );
    try {
      await ready;
    } catch (error) {
      set({ status: 'error', buffering: false });
      throw error;
    }
    loaded = true;
    p.playbackRate = rate;
    if (startAtSec > 0) p.currentTime = startAtSec;
    set({ status: 'ready', positionSec: startAtSec });
  },

  play() {
    if (!player || !loaded) return;
    wantsPlay = true;
    // After the end, play starts the episode again.
    if (ended) {
      player.currentTime = 0;
      ended = false;
    }
    player.play();
  },

  pause() {
    wantsPlay = false;
    player?.pause();
    set({ buffering: false });
  },

  async seekTo(positionSec) {
    if (player) player.currentTime = positionSec;
    ended = false;
    set({ positionSec });
  },

  setRate(rate) {
    if (player) player.playbackRate = rate;
    set({ rate });
  },

  unload() {
    wantsPlay = false;
    hasStarted = false;
    ended = false;
    loaded = false;
    if (player) {
      player.pause();
      void player.replaceAsync(null).catch(() => undefined);
    }
    set({ ...initialEngineState, rate: state.rate });
  },

  getState: () => state,

  onChange(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
