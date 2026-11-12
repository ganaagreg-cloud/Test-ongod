import { useEffect } from 'react';
import { AppState } from 'react-native';
import { player } from '../audio/player';
import { mn } from '../i18n/mn';
import { useToast } from '../ui';
import { isScreenCaptured, watchScreenCapture } from './guard';

/**
 * ADR-0094: while the screen is recorded or mirrored the player is paused and cannot start, in
 * every screen and in the background (the mini player keeps playing outside the Player screen, so
 * blanking the picture there is not enough). Checked again whenever the app returns to the front,
 * in case a change was missed while it was suspended.
 */
export function useCaptureGuard() {
  const toast = useToast();
  useEffect(() => {
    const apply = (captured: boolean) => {
      const wasPlaying = player.getState().status === 'playing';
      player.setCaptureBlocked(captured);
      if (captured && wasPlaying) toast.show(mn.capture.paused, { tone: 'danger' });
    };
    const stop = watchScreenCapture(apply);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void isScreenCaptured().then(apply);
    });
    return () => {
      stop();
      appState.remove();
    };
  }, [toast]);
}
