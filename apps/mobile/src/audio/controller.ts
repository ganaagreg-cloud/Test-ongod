import { createProgressSaver, type ProgressBody } from './progress';
import { nextRate } from './rates';
import {
  createSleepTimer,
  type SleepMode,
  type SleepState,
  type SleepTimerDeps,
} from './sleepTimer';
import type { AudioEngine, EngineState } from './types';

/** The answer of POST /v1/episodes/:id/play (packages/shared `playResponseSchema`). */
export interface PlayInfo {
  url: string;
  /** ISO time; the URL is refused after it. */
  expiresAt: string;
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
  sleep: SleepState;
  /** Set when asking for the play URL failed (e.g. NO_ACCESS): the screen shows the no-access sheet. */
  error: { code: string | undefined; message: string } | null;
}

export interface ControllerDeps {
  engine: AudioEngine;
  fetchPlay: (episodeId: string) => Promise<PlayInfo>;
  saveProgress: (episodeId: string, body: ProgressBody) => Promise<void>;
  now?: () => number;
  sleepDeps?: SleepTimerDeps;
}

/** Ask for a fresh URL when the current one has less than this left. */
export const URL_REFRESH_MARGIN_MS = 60_000;
/** The in-app skip buttons (the lock screen's are fixed at 10 s by expo-audio, ADR-0032). */
export const SKIP_BACK_SEC = 15;
export const SKIP_FORWARD_SEC = 30;

/**
 * The one player of the app: loads an episode through the signed URL, keeps it fresh, saves progress,
 * runs the speed and the sleep timer. Platform-free (the engine, the API and the clock come in),
 * so the rules are tested without a phone.
 */
export function createPlayerController(deps: ControllerDeps) {
  const { engine, fetchPlay, saveProgress } = deps;
  const now = deps.now ?? (() => Date.now());

  const saver = createProgressSaver(saveProgress);
  let episode: EpisodeToPlay | undefined;
  let expiresAtMs = 0;
  let error: PlayerState['error'] = null;
  let openToken = 0;
  let lastStatus = engine.getState().status;
  const listeners = new Set<(state: PlayerState) => void>();

  const sleep = createSleepTimer(() => {
    engine.pause();
    void saver.flush('sleep');
  }, deps.sleepDeps);

  const state = (): PlayerState => ({
    ...engine.getState(),
    episodeId: episode?.id ?? null,
    sleep: sleep.getState(),
    error,
  });
  const emit = () => {
    const snapshot = state();
    for (const listener of listeners) listener(snapshot);
  };

  engine.onChange((s) => {
    saver.setDuration(s.durationSec);
    saver.update(s.positionSec, s.status === 'playing');
    if (s.status === 'ended' && lastStatus !== 'ended') {
      void saver.flush('ended');
      sleep.episodeEnded();
    }
    lastStatus = s.status;
    emit();
  });
  sleep.onChange(emit);

  async function loadFresh(position: number, token: number): Promise<boolean> {
    if (!episode) return false;
    let info: PlayInfo;
    try {
      info = await fetchPlay(episode.id);
    } catch (cause) {
      if (token !== openToken) return false;
      const code = (cause as { code?: unknown }).code;
      error = {
        code: typeof code === 'string' ? code : undefined,
        message: cause instanceof Error ? cause.message : String(cause),
      };
      emit();
      throw cause;
    }
    if (token !== openToken) return false;
    error = null;
    expiresAtMs = Date.parse(info.expiresAt);
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
    return token === openToken;
  }

  /** Before playing or seeking: get a new URL if the old one is about to stop working. */
  async function ensureFresh(position: number): Promise<void> {
    if (!episode || expiresAtMs - now() > URL_REFRESH_MARGIN_MS) return;
    await loadFresh(position, openToken);
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
      await saver.flush('switch');
      episode = next;
      error = null;
      emit();
      const start = next.startAtSec ?? 0;
      saver.track(next.id, 0, start);
      if (!(await loadFresh(start, token))) return;
      engine.play();
    },

    async play(): Promise<void> {
      if (!episode) return;
      await ensureFresh(engine.getState().positionSec);
      engine.play();
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
      sleep.cancel();
      await saver.flush('close');
      saver.clear();
      engine.unload();
      episode = undefined;
      expiresAtMs = 0;
      error = null;
      emit();
    },
  };
  return controller;
}

export type PlayerController = ReturnType<typeof createPlayerController>;
