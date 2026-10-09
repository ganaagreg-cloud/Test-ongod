import { Redirect } from 'expo-router';

// DEV ONLY. In a release build `__DEV__` is false, Metro drops the require() below, and the
// screen code is not bundled; the route just redirects home.
const UiScreen: React.ComponentType | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../src/dev/UiScreen').default
  : null;

export default function DevUiRoute() {
  return UiScreen ? <UiScreen /> : <Redirect href="/" />;
}
