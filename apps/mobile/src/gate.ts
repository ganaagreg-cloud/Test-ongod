import { useAuth } from './auth/AuthContext';
import { env } from './config/env';
import { useAppConfig } from './config/useAppConfig';

/** Where the app is on its way in. One value decides which group of screens exists. */
export type Gate =
  | 'apiMissing' // EXPO_PUBLIC_API_URL not set (a developer mistake)
  | 'loading' // fonts, app-config and the stored session are still being read
  | 'update' // the installed version is below the server's minimum (SPEC I): blocking
  | 'unreachable' // a stored session could not be checked, no network
  | 'signedOut'
  | 'pendingProfile' // social sign-in done, the mandatory profile step is not (SPEC C)
  | 'signedIn';

export function useGate(): Gate {
  const { phase, user } = useAuth();
  const config = useAppConfig();

  if (!env.apiUrl) return 'apiMissing';
  if (config.updateRequired) return 'update';
  if (phase === 'loading' || config.pending) return 'loading';
  if (phase === 'unreachable') return 'unreachable';
  if (phase === 'signedOut' || !user) return 'signedOut';
  return user.status === 'PENDING_PROFILE' ? 'pendingProfile' : 'signedIn';
}
