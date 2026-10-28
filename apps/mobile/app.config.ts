import type { ExpoConfig } from 'expo/config';

// Build-time settings come from the environment (CLAUDE.md: nothing account-specific in code):
//   GOOGLE_IOS_URL_SCHEME  reversed iOS client id, needed by the Google sign-in plugin
//   SENTRY_ORG, SENTRY_PROJECT  turn on source-map upload during builds (needs SENTRY_AUTH_TOKEN
//                               as an EAS secret); without them the Sentry plugin is left out
//   EAS_PROJECT_ID          the EAS project; push tokens need it (ADR-0055). Without it the app
//                           skips push registration
//   GOOGLE_SERVICES_FILE    path to google-services.json (an EAS file variable): Android push
//                           goes through Firebase Cloud Messaging (R-expo-notifications-sdk57)
// Runtime settings are EXPO_PUBLIC_* (see .env.example); the app reads them in src/config/env.ts.

const googleIosScheme = process.env.GOOGLE_IOS_URL_SCHEME;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const easProjectId = process.env.EAS_PROJECT_ID;
const googleServicesFile = process.env.GOOGLE_SERVICES_FILE;

const plugins: NonNullable<ExpoConfig['plugins']> = [
  'expo-router',
  'expo-secure-store',
  'expo-image',
  // Audio (ADR-0032): background playback on (Android media foreground service, iOS `audio` mode).
  // The app never records: no microphone permission on iOS, no RECORD_AUDIO on Android.
  [
    'expo-audio',
    { enableBackgroundPlayback: true, microphonePermission: false, recordAudioAndroid: false },
  ],
  // Video episodes (ADR-0038, option A of open question #17): the sound keeps playing in the
  // background with lock-screen controls. No picture in picture.
  ['expo-video', { supportsBackgroundPlayback: true, supportsPictureInPicture: false }],
  // Portrait from the first frame on iOS; src/video/orientation.ts keeps it portrait at runtime
  // and turns a fullscreen video to landscape.
  ['expo-screen-orientation', { initialOrientation: 'PORTRAIT_UP' }],
  // Push (ADR-0055): the Android channel the app creates before it asks. iOS gets the
  // aps-environment entitlement in the plugin's default mode "development"; what a store build
  // needs is TO-VERIFY (R-expo-notifications-sdk57).
  ['expo-notifications', { defaultChannel: 'default' }],
];
if (googleIosScheme) {
  plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosScheme }]);
}
if (sentryOrg && sentryProject) {
  plugins.push([
    '@sentry/react-native/expo',
    {
      url: process.env.SENTRY_URL ?? 'https://sentry.io/',
      organization: sentryOrg,
      project: sentryProject,
    },
  ]);
}

const config: ExpoConfig = {
  name: 'Онгод',
  slug: 'ongod',
  scheme: 'ongod',
  version: '0.1.0',
  // 'default' so a fullscreen video can turn to landscape on iOS (R-expo-video-sdk57); every
  // screen is locked to portrait at runtime (src/video/orientation.ts).
  orientation: 'default',
  userInterfaceStyle: 'dark',
  backgroundColor: '#021512', // themes.dark.bg (app.config cannot import the workspace package)
  ios: {
    bundleIdentifier: 'mn.ongod.app',
    supportsTablet: false,
    // Required when Google sign-in is offered on iOS (App Review 4.8, see R-apple-login-services-4-8).
    usesAppleSignIn: true,
    infoPlist: {
      // UIBackgroundModes "audio" comes from the expo-audio plugin (enableBackgroundPlayback).
      // Lets the system "Sign in with Apple" button use the device language.
      CFBundleAllowMixedLocalizations: true,
    },
  },
  android: {
    package: 'mn.ongod.app',
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
  ...(easProjectId ? { extra: { eas: { projectId: easProjectId } } } : {}),
  plugins,
  experiments: {
    typedRoutes: true,
  },
  web: {
    bundler: 'metro',
    output: 'single',
  },
};

export default config;
