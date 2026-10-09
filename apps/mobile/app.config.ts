import type { ExpoConfig } from 'expo/config';

// Build-time settings come from the environment (CLAUDE.md: nothing account-specific in code):
//   GOOGLE_IOS_URL_SCHEME  reversed iOS client id, needed by the Google sign-in plugin
//   SENTRY_ORG, SENTRY_PROJECT  turn on source-map upload during builds (needs SENTRY_AUTH_TOKEN
//                               as an EAS secret); without them the Sentry plugin is left out
// Runtime settings are EXPO_PUBLIC_* (see .env.example); the app reads them in src/config/env.ts.

const googleIosScheme = process.env.GOOGLE_IOS_URL_SCHEME;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

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
  orientation: 'portrait',
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
  },
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
