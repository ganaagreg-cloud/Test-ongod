import Constants from 'expo-constants';

/**
 * True when the JS runs inside the Expo Go store app (preview only, ADR-0033). Expo Go has no
 * custom native modules, so anything that needs one (Google sign-in, Sentry native, Apple
 * sign-in for our bundle id) must be skipped there. Dev and store builds are never Expo Go.
 */
export const isExpoGo = Constants.executionEnvironment === 'storeClient';
