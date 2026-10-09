// Runtime settings. Metro only inlines `process.env.EXPO_PUBLIC_*` when it is written out in
// full, so every name is spelled here. Nothing secret belongs in these variables.

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const env = {
  /** e.g. http://10.0.2.2:3000 (no trailing slash, no /v1). */
  apiUrl: clean(process.env.EXPO_PUBLIC_API_URL)?.replace(/\/+$/, ''),
  sentryDsn: clean(process.env.EXPO_PUBLIC_SENTRY_DSN),
  sentryEnvironment: clean(process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT) ?? 'development',
  iosStoreUrl: clean(process.env.EXPO_PUBLIC_IOS_STORE_URL),
  androidStoreUrl: clean(process.env.EXPO_PUBLIC_ANDROID_STORE_URL),
  googleWebClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  googleIosClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
} as const;
