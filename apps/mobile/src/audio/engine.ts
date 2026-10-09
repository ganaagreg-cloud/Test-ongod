// Native (iOS/Android): playback through expo-audio (ADR-0032, [[R-expo-audio-sdk57]]).
// The browser preview uses engine.web.ts, a stub (audio plays on the phone only).
//
// One player for the whole app: the OS lets only ONE player own the lock screen, so a second player
// would steal it. A new episode is `replace`d into the same player.
//
// Android stops background playback after about 3 minutes unless lock-screen controls are active,
// so they are switched on with every play() and stay on while paused; unload() removes them.
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import {
  initialEngineState,
  type AudioEngine,
  type AudioTrack,
  type EngineListener,
  type EngineState,
} from './types';

export const audioAvailable = true;
export type { AudioEngine, AudioTrack, EngineState, EngineStatus } from './types';

/** How often position updates arrive (ms). Twice a second keeps the scrubber smooth and cheap. */
const UPDATE_INTERVAL_MS = 500;
/** Give up on a file that never becomes ready. */
const LOAD_TIMEOUT_MS = 30_000;

let player: AudioPlayer | undefined;
let audioMode: Promise<void> | undefined;

let state: EngineState = initialEngineState;
let track: AudioTrack | undefined;
/** The user asked to play; stays true while the file buffers. */
let wantsPlay = false;
let hasStarted = false;
let pendingSeekSec: number | undefined;
let loadWaiters: Array<{ ok: () => void }> = [];
const listeners = new Set<EngineListener>();

function set(patch: Partial<EngineState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

function deriveStatus(status: AudioStatus): EngineState['status'] {
  if (status.didJustFinish) return 'ended';
  if (!status.isLoaded) return track ? 'loading' : 'idle';
  if (status.playing) return 'playing';
  return hasStarted ? 'paused' : 'ready';
}

function onStatus(status: AudioStatus) {
  const next = deriveStatus(status);
  if (status.playing) hasStarted = true;

  if (status.isLoaded && pendingSeekSec !== undefined) {
    // Resume position requested at load time.
    const target = pendingSeekSec;
    pendingSeekSec = undefined;
    void player?.seekTo(target);
  }

  set({
    status: next,
    positionSec: status.currentTime,
    durationSec: status.duration > 0 ? status.duration : state.durationSec,
    rate: status.playbackRate,
    buffering: wantsPlay && status.isBuffering,
  });

  if (status.isLoaded && loadWaiters.length > 0) {
    const waiting = loadWaiters;
    loadWaiters = [];
    for (const waiter of waiting) waiter.ok();
  }
}

async function ensurePlayer(): Promise<AudioPlayer> {
  audioMode ??= setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    // Exclusive audio focus, and what the lock-screen controls need to work (expo-audio docs).
    interruptionMode: 'doNotMix',
  });
  await audioMode;
  if (!player) {
    player = createAudioPlayer(null, { updateInterval: UPDATE_INTERVAL_MS });
    player.addListener('playbackStatusUpdate', onStatus);
  }
  return player;
}

/** Lock-screen / notification controls: title, artist, picture, seek buttons (the OS fixes them at 10 s). */
function activateLockScreen(p: AudioPlayer) {
  if (!track) return;
  p.setActiveForLockScreen(
    true,
    {
      title: track.title,
      ...(track.artist ? { artist: track.artist } : {}),
      ...(track.artworkUrl ? { artworkUrl: track.artworkUrl } : {}),
    },
    { showSeekBackward: true, showSeekForward: true },
  );
}

export const engine: AudioEngine = {
  async load(next, startAtSec = 0) {
    const p = await ensurePlayer();
    track = next;
    wantsPlay = false;
    hasStarted = false;
    pendingSeekSec = startAtSec > 0 ? startAtSec : undefined;
    const rate = state.rate;
    set({ status: 'loading', positionSec: startAtSec, durationSec: 0, buffering: false });

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        loadWaiters = loadWaiters.filter((waiter) => waiter.ok !== done);
        reject(new Error('audio load timed out'));
      }, LOAD_TIMEOUT_MS);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      loadWaiters.push({ ok: done });
    });
    p.replace({ uri: next.url });
    p.setPlaybackRate(rate);
    try {
      await ready;
    } catch (error) {
      set({ status: 'error', buffering: false });
      throw error;
    }
    activateLockScreen(p);
  },

  play() {
    if (!player || !track) return;
    wantsPlay = true;
    // Lock-screen controls first: without them Android ends background playback after ~3 min.
    activateLockScreen(player);
    // After the end, play starts the episode again.
    if (state.status === 'ended') void player.seekTo(0);
    player.play();
  },

  pause() {
    wantsPlay = false;
    player?.pause();
    set({ buffering: false });
  },

  async seekTo(positionSec) {
    await player?.seekTo(positionSec);
    set({ positionSec });
  },

  setRate(rate) {
    player?.setPlaybackRate(rate);
    set({ rate });
  },

  unload() {
    wantsPlay = false;
    hasStarted = false;
    pendingSeekSec = undefined;
    track = undefined;
    if (player) {
      player.pause();
      player.clearLockScreenControls();
      player.replace(null);
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
