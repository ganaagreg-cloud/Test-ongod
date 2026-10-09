import { Redirect } from 'expo-router';

// DEV ONLY (device gate, docs/runbooks/DEVICE_SMOKE.md). In a release build `__DEV__` is false,
// Metro drops the require() below, and the screen code is not bundled; the route just redirects home.
const AudioScreen: React.ComponentType | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../src/dev/AudioScreen').default
  : null;

export default function DevAudioRoute() {
  return AudioScreen ? <AudioScreen /> : <Redirect href="/" />;
}
