// Native (iOS/Android): playback through react-native-track-player.
// The browser preview uses engine.web.ts, a stub (the native module does not exist on web).
import TrackPlayer from 'react-native-track-player';

export const audioAvailable = true;

export interface AudioTrack {
  url: string;
  title: string;
  artist?: string;
  artwork?: string;
}

let ready: Promise<void> | undefined;
const ensureReady = () => (ready ??= TrackPlayer.setupPlayer());

export async function playTrack(track: AudioTrack): Promise<void> {
  await ensureReady();
  await TrackPlayer.reset();
  await TrackPlayer.add(track);
  await TrackPlayer.play();
}

export async function pause(): Promise<void> {
  await ensureReady();
  await TrackPlayer.pause();
}
