// Browser preview only: a stub with the same shape as engine.ts. Nothing plays; screens show
// <AudioWebNotice /> instead of a working player.
import { initialEngineState, type AudioEngine } from './types';

export const audioAvailable = false;
export type { AudioEngine, AudioTrack, EngineState, EngineStatus } from './types';

export const engine: AudioEngine = {
  async load() {},
  play() {},
  pause() {},
  async seekTo() {},
  setRate() {},
  unload() {},
  getState: () => initialEngineState,
  onChange: () => () => undefined,
};
