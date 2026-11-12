import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/**
 * ADR-0094: the local native module `modules/capture-guard`. iOS tells the app when the screen
 * starts or stops being recorded or mirrored; Android forbids other apps to record this app's sound
 * as soon as the module loads and never reports a capture. Missing (web, Expo Go, a build made
 * before the module existed): everything here is a no-op, so nothing breaks.
 */
interface CaptureGuardNative {
  isCaptured(): Promise<boolean>;
  addListener(
    event: 'onCaptureChange',
    listener: (payload: { captured: boolean }) => void,
  ): EventSubscription;
}

const native = requireOptionalNativeModule<CaptureGuardNative>('CaptureGuard');

/** The native module is in this build. */
export const captureGuardAvailable = native !== null;

/** Whether the screen is being recorded or mirrored right now (false where it cannot be known). */
export async function isScreenCaptured(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isCaptured();
  } catch {
    return false;
  }
}

/** Calls `onChange` with the state now and on every change. Returns the function that stops it. */
export function watchScreenCapture(onChange: (captured: boolean) => void): () => void {
  if (!native) return () => undefined;
  let stopped = false;
  const handle = native.addListener('onCaptureChange', ({ captured }) => {
    if (!stopped) onChange(captured);
  });
  void isScreenCaptured().then((captured) => {
    if (!stopped) onChange(captured);
  });
  return () => {
    stopped = true;
    handle.remove();
  };
}
