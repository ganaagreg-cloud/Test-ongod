// The shape every audio engine has (ADR-0032). The native engine (engine.ts) wraps expo-audio; the
// browser preview (engine.web.ts) is a stub. The rest of the app, and the tests, talk to this
// interface only.

export interface AudioTrack {
  /** Signed Bunny URL from POST /v1/episodes/:id/play. A bearer credential: never log it. */
  url: string;
  title: string;
  artist?: string | undefined;
  /** Lock-screen picture: a center crop of the 16:9 artwork (square-ish), as a URL. */
  artworkUrl?: string | undefined;
}

export type EngineStatus =
  /** Nothing loaded. */
  | 'idle'
  /** Source set, the file is not ready yet. */
  | 'loading'
  /** Loaded, never started (or seeked and not playing). */
  | 'ready'
  | 'playing'
  | 'paused'
  /** Reached the end. */
  | 'ended'
  | 'error';

export interface EngineState {
  status: EngineStatus;
  positionSec: number;
  /** 0 until the file reports it. */
  durationSec: number;
  rate: number;
  /** Waiting for data while playing. */
  buffering: boolean;
}

export type EngineListener = (state: EngineState) => void;

export interface AudioEngine {
  /** Replace what is loaded; resolves when it can play. `startAtSec` resumes a half-heard episode. */
  load(track: AudioTrack, startAtSec?: number): Promise<void>;
  /** Starts (or resumes) playback and keeps the lock-screen controls on while it plays. */
  play(): void;
  pause(): void;
  seekTo(positionSec: number): Promise<void>;
  setRate(rate: number): void;
  /** Stop, drop the file and remove the lock-screen controls. */
  unload(): void;
  getState(): EngineState;
  /** Called on every change (about twice a second while playing). Returns a function that stops listening. */
  onChange(listener: EngineListener): () => void;
}

export const initialEngineState: EngineState = {
  status: 'idle',
  positionSec: 0,
  durationSec: 0,
  rate: 1,
  buffering: false,
};
