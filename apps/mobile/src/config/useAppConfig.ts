import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '../api';
import { isBelowMinVersion } from '../lib/version';

/** The installed version: the real native one, or the app config's in the browser preview. */
export const installedVersion = (): string | null =>
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;

/**
 * GET /v1/app-config on start (SPEC I). One try only: with no network the app opens normally
 * (login needs the network anyway), and it checks again whenever it returns to the foreground.
 */
export function useAppConfig() {
  const query = useQuery({
    queryKey: ['app-config'],
    queryFn: ({ signal }) => api.appConfig(signal),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const minimum = query.data?.minVersion[platform];
  return {
    /** First answer still on its way (neither data nor an error yet). */
    pending: query.isPending,
    /** The installed version is older than the server's minimum: show the blocking screen. */
    updateRequired: minimum !== undefined && isBelowMinVersion(installedVersion(), minimum),
    /** The server offers Google / Apple sign-in (SOCIAL_LOGIN). */
    socialLogin: query.data?.socialLogin ?? false,
  };
}
