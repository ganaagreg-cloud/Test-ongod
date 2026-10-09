// Sentry's Metro config adds debug ids to the bundle so crash reports can be matched with the
// uploaded source maps. It wraps Expo's default config, which already handles the monorepo.
// Metro loads this file as CommonJS, so `require` is required here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
