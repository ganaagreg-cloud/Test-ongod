// Browser preview only: a stub with the same shape as engine.ts (video plays on the phone only,
// like audio, ADR-0024). Screens show <AudioWebNotice /> instead of a picture.
import type { VideoPlayer } from 'expo-video';
import { initialEngineState, type AudioEngine } from '../audio/types';

export const videoAvailable = false;

export const getVideoPlayer = (): VideoPlayer | undefined => undefined;
export const onVideoPlayerCreated = (): (() => void) => () => undefined;

export const videoEngine: AudioEngine = {
  async load() {},
  play() {},
  pause() {},
  async seekTo() {},
  setRate() {},
  unload() {},
  getState: () => initialEngineState,
  onChange: () => () => undefined,
};
