// expo-video loads its native module as soon as it is imported, and throws if it is missing.
// Whether Expo Go on the App Store has it is TO-VERIFY ([[R-expo-video-sdk57]]); the player is
// loaded at start-up, so a missing module must not stop the app: video is then just unavailable.
import { requireOptionalNativeModule } from 'expo';
import type * as ExpoVideo from 'expo-video';

export const videoModule: typeof ExpoVideo | null =
  requireOptionalNativeModule('ExpoVideo') !== null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-video') as typeof ExpoVideo)
    : null;
