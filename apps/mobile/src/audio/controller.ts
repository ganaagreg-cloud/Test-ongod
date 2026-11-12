import { createProgressSaver, type ProgressBody } from './progress';
import { nextRate } from './rates';
import { mn } from '../i18n/mn';
import {
  createSleepTimer,
  type SleepMode,
  type SleepState,
  type SleepTimerDeps,
} from './sleepTimer';
import type { AudioEngine, EngineState } from './types';

/** What an episode's one media file is (ADR-0038). */
export type MediaKind = 'AUDIO' | 'VIDEO';

/** The answer of POST /v1/episodes/:id/play (packages/shared `playResponseSchema`). */
export interface PlayInfo {
  /** AUDIO: a signed file URL; VIDEO: a signed HLS playlist. Missing means AUDIO. */
  kind?: MediaKind | undefined;
  url: string;
  /** ISO time; the URL is refused after it. */
  expiresAt: string;
  accessEndsAt?: string | null;
  durationSec: number | null;
}

export interface EpisodeToPlay {
  id: string;
  title: string;
  artist?: string | undefined;
  /** Lock-screen picture (center crop of the 16:9 artwork). */
  artworkUrl?: string | undefined;
  /** Resume position from the saved progress. */
  startAtSec?: number | undefined;
}

export interface PlayerState extends EngineState {
  episodeId: string | null;
  /** What is loaded: VIDEO shows <VideoSurface />. null before the first play URL. */
  kind: MediaKind | null;
  sleep: SleepState;
  /** A sleep timer is set or has fired for this episode: nothing may start by itself (ADR-0049). */
  autoplayBlocked: boolean;
  /** Set when asking for the play URL failed (e.g. NO_ACCESS): the screen shows the no-access sheet. */
  error: { code: string | undefined; message: string } | null;
  /** The screen is being recorded or mirrored: nothing plays until it stops (ADR-0094). */
  captureBlocked: boolean;
}

export interface ControllerDeps {
  /** Plays AUDIO episodes. */
  engine: AudioEngine;
  /** Plays VIDEO episodes (expo-video). Without it a video episode reports an error. */
  videoEngine?: AudioEngine | undefined;
  fetchPlay: (episodeId: string) => Promise<PlayInfo>;
  saveProgress: (episodeId: string, body: ProgressBody) => Promise<void>;
  now?: () => number;
  sleepDeps?: SleepTimerDeps;
}

/** Ask for a fresh URL when the current one has less than this left. */
export const URL_REFRESH_MARGIN_MS = 60_000;
/** The in-app skip buttons, 15 s both ways (ADR-0079; the lock screen's are fixed at 10 s by expo-audio, ADR-0032). */
export const SKIP_BACK_SEC = 15;
export const SKIP_FORWARD_SEC = 15;

/** Error code when play is asked while the screen is being recorded or mirrored (ADR-0094). */
export const SCREEN_CAPTURE = 'SCREEN_CAPTURE';
/** Error code when a video episode reaches a player without a video engine. */
export const VIDEO_UNSUPPORTED = 'VIDEO_UNSUPPORTED';
/** API answers that mean "you may not play this" (not a network error): playback stops. */
const REFUSED = new Set(['NO_ACCESS', 'NOT_FOUND', 'UNAUTHORIZED']);

/**
 * The one player of the app: loads an episode through the signed URL, keeps it fresh, saves progress,
 * runs the speed and the sleep timer. Platform-free (the engines, the API and the clock come in),
 * so the rules are tested without a phone.
 *
 * Audio and video episodes use different engines (ADR-0038); only one is loaded at a time. The play
 * URL says which kind the episode is, and switching kinds unloads the other engine first, so one
 * player owns the lock screen. Progress, speed and the sleep timer work the same for both.
 */
export function createPlayerController(deps: ControllerDeps) {
  const { engine: audioEngine, videoEngine, fetchPlay, saveProgress } = deps;
  const now = deps.now ?? (() => Date.now());
  /** The engine that holds (or last held) the current episode; the other one is idle. */
  let engine: AudioEngine = audioEngine;
  let kind: MediaKind | null = null;

  const saver = createProgressSaver(saveProgress);
  let episode: EpisodeToPlay | undefined;
  let expiresAtMs = 0;
  let accessEndsAtMs: number | null = null;
  let accessTimer: unknown;
  const timers = deps.sleepDeps ?? {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const clearAccessTimer = () => {
    if (accessTimer !== undefined) timers.clearTimeout(accessTimer);
    accessTimer = undefined;
  };
  function checkAccessDeadline(): boolean {
    clearAccessTimer();
    if (accessEndsAtMs === null) return false;
    const remaining = accessEndsAtMs - now();
    if (remaining > 0) {
      accessTimer = timers.setTimeout(checkAccessDeadline, Math.min(remaining, 2_147_483_647));
      return false;
    }
    error = { code: 'NO_ACCESS', message: mn.noAccess.title };
    if (engine.getState().status !== 'paused') engine.pause();
    void saver.flush('pause');
    emit();
    return true;
  }
  let error: PlayerState['error'] = null;
  /** ADR-0094: true while the screen is recorded or mirrored. Sound must not reach a recording. */
  let captureBlocked = false;
  const captureError = () => Object.assign(new Error(mn.capture.blocked), { code: SCREEN_CAPTURE });
  let openToken = 0;
  let lastStatus = engine.getState().status;
  const listeners = new Set<(state: PlayerState) => void>();

  /** The timer fired since the member last opened an episode by hand. */
  let sleepFired = false;
  const sleep = createSleepTimer(() => {
    sleepFired = true;
    engine.pause();
    void saver.flush('sleep');
    emit();
  }, deps.sleepDeps);

  const state = (): PlayerState => ({
    ...engine.getState(),
    episodeId: episode?.id ?? null,
    kind,
    sleep: sleep.getState(),
    autoplayBlocked: sleepFired || sleep.getState().mode !== null,
    error,
    captureBlocked,
  });
  const emit = () => {
    const snapshot = state();
    for (const listener of listeners) listener(snapshot);
  };

  const watch = (source: AudioEngine) =>
    source.onChange((s) => {
      // The idle engine's changes (its unload after a switch) are not the current episode's.
      if (source !== engine) return;
      // The lock screen or a headset button can start the engine without the app: stop it again.
      if (s.status === 'playing' && captureBlocked) {
        source.pause();
        return;
      }
      if (s.status === 'playing' && accessEndsAtMs !== null && now() >= accessEndsAtMs) {
        checkAccessDeadline();
        return;
      }
      saver.setDuration(s.durationSec);
      saver.update(s.positionSec, s.status === 'playing');
      if (s.status === 'ended' && lastStatus !== 'ended') {
        void saver.flush('ended');
        sleep.episodeEnded();
      }
      lastStatus = s.status;
      emit();
    });
  watch(audioEngine);
  if (videoEngine && videoEngine !== audioEngine) watch(videoEngine);
  sleep.onChange(emit);

  /** Make `next` the engine; the old one is unloaded and the speed carries over. */
  function switchEngine(next: AudioEngine) {
    if (next === engine) return;
    const previous = engine;
    const { rate } = previous.getState();
    engine = next;
    if (previous.getState().status !== 'idle') previous.unload();
    next.setRate(rate);
    lastStatus = next.getState().status;
  }

  const fail = (code: string | undefined, message: string) => {
    error = { code, message };
    emit();
  };

  async function loadFresh(position: number, token: number): Promise<boolean> {
    if (!episode) return false;
    let info: PlayInfo;
    try {
      info = await fetchPlay(episode.id);
    } catch (cause) {
      if (token !== openToken) return false;
      const code = (cause as { code?: unknown }).code;
      fail(
        typeof code === 'string' ? code : undefined,
        cause instanceof Error ? cause.message : String(cause),
      );
      throw cause;
    }
    if (token !== openToken) return false;
    const nextKind = info.kind ?? 'AUDIO';
    const next = nextKind === 'VIDEO' ? videoEngine : audioEngine;
    if (!next) {
      const cause = Object.assign(new Error('video playback is not available'), {
        code: VIDEO_UNSUPPORTED,
      });
      fail(VIDEO_UNSUPPORTED, cause.message);
      throw cause;
    }
    switchEngine(next);
    kind = nextKind;
    error = null;
    expiresAtMs = Date.parse(info.expiresAt);
    accessEndsAtMs = info.accessEndsAt ? Date.parse(info.accessEndsAt) : null;
    saver.setDuration(info.durationSec ?? 0);
    await engine.load(
      {
        url: info.url,
        title: episode.title,
        artist: episode.artist,
        artworkUrl: episode.artworkUrl,
      },
      position,
    );
    if (token !== openToken) return false;
    return !checkAccessDeadline();
  }

  /**
   * Before playing or seeking: get a new URL if the old one is about to stop working. If the API
   * refuses it (access ended meanwhile), what is still buffered must not play on (re-audit).
   */
  async function ensureFresh(position: number): Promise<void> {
    if (!episode || expiresAtMs - now() > URL_REFRESH_MARGIN_MS) return;
    try {
      await loadFresh(position, openToken);
    } catch (cause) {
      if (REFUSED.has(String((cause as { code?: unknown }).code))) {
        engine.pause();
        void saver.flush('pause');
        emit();
      }
      throw cause;
    }
  }

  const controller = {
    getState: state,
    onChange(listener: (state: PlayerState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Load an episode and start it. Throws the API error (e.g. NO_ACCESS) if the URL is refused. */
    async open(next: EpisodeToPlay): Promise<void> {
      const token = ++openToken;
      clearAccessTimer();
      accessEndsAtMs = null;
      if (engine.getState().status === 'playing') engine.pause();
      sleepFired = false;
      await saver.flush('switch');
      episode = next;
      error = null;
      emit();
      const start = next.startAtSec ?? 0;
      saver.track(next.id, 0, start);
      if (!(await loadFresh(start, token))) return;
      // Loaded and ready, but silent while the screen is recorded (ADR-0094).
      if (captureBlocked) throw captureError();
      engine.play();
    },

    async play(): Promise<void> {
      if (!episode) return;
      if (captureBlocked) throw captureError();
      await ensureFresh(engine.getState().positionSec);
      if (checkAccessDeadline()) return;
      if (captureBlocked) throw captureError();
      engine.play();
    },

    /**
     * ADR-0094: the screen started or stopped being recorded or mirrored. While it is, playback is
     * paused and cannot start; when it stops the member presses play again (nothing resumes alone).
     */
    setCaptureBlocked(blocked: boolean): void {
      if (blocked === captureBlocked) return;
      captureBlocked = blocked;
      if (blocked && engine.getState().status === 'playing') {
        engine.pause();
        void saver.flush('pause');
      }
      emit();
    },
    pause(): void {
      engine.pause();
      void saver.flush('pause');
    },
    async toggle(): Promise<void> {
      if (engine.getState().status === 'playing') controller.pause();
      else await controller.play();
    },

    async seekTo(positionSec: number): Promise<void> {
      const { durationSec } = engine.getState();
      const target = Math.max(
        0,
        durationSec > 0 ? Math.min(positionSec, durationSec) : positionSec,
      );
      await ensureFresh(target);
      await engine.seekTo(target);
      void saver.flush('seek');
    },
    seekBy: (deltaSec: number): Promise<void> =>
      controller.seekTo(engine.getState().positionSec + deltaSec),
    skipBack: (): Promise<void> => controller.seekBy(-SKIP_BACK_SEC),
    skipForward: (): Promise<void> => controller.seekBy(SKIP_FORWARD_SEC),

    setRate: (rate: number) => engine.setRate(rate),
    /** The speed chip: 1x -> 1.25x -> 1.5x -> 2x -> 1x. Returns the new rate. */
    cycleRate(): number {
      const rate = nextRate(engine.getState().rate);
      engine.setRate(rate);
      return rate;
    },

    startSleep: (mode: SleepMode) => sleep.start(mode),
    cancelSleep: () => sleep.cancel(),
    sleepRemainingMs: () => sleep.remainingMs(),

    /** Stop everything (sign-out, no access): final save, unload, lock-screen controls removed. */
    async close(): Promise<void> {
      openToken++;
      clearAccessTimer();
      accessEndsAtMs = null;
      sleepFired = false;
      sleep.cancel();
      await saver.flush('close');
      saver.clear();
      engine.unload();
      episode = undefined;
      kind = null;
      expiresAtMs = 0;
      error = null;
      emit();
    },
  };
  return { ...controller, checkAccessDeadline };
}

export type PlayerController = ReturnType<typeof createPlayerController>;
