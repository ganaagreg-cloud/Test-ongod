// The app is portrait; only a video in fullscreen turns to landscape (DESIGN Player, ADR-0038).
// app.config allows every orientation so iOS can rotate at all ([[R-expo-video-sdk57]]: the
// fullscreen orientation option is Android only); the lock here keeps every screen portrait.
import { Platform } from 'react-native';
import { lockAsync, OrientationLock, unlockAsync } from 'expo-screen-orientation';

/** Every screen: portrait, notch up. */
export function lockPortrait(): Promise<void> {
  return lockAsync(OrientationLock.PORTRAIT_UP).catch(() => undefined);
}

/**
 * Fullscreen video. iOS: turn to landscape here. Android: expo-video's fullscreen screen turns
 * itself (`fullscreenOptions.orientation`), the app screen only lets go of its lock.
 */
export function allowFullscreenLandscape(): Promise<void> {
  const change = Platform.OS === 'ios' ? lockAsync(OrientationLock.LANDSCAPE) : unlockAsync();
  return change.catch(() => undefined);
}
