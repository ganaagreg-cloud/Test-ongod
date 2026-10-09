import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserDto } from '@ongod/shared';
import * as endpoints from '../api/endpoints';
import { refreshSession, session } from '../api/client';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthApi {
  status: Status;
  user: UserDto | null;
  /** Throws ApiError (INVALID_CREDENTIALS, DEVICE_LIMIT with details.devices, ...). */
  login: (identifier: string, password: string, removeDeviceId?: string) => Promise<UserDto>;
  logout: () => Promise<void>;
  /** Reloads the profile, e.g. after the email was verified. */
  reloadUser: () => Promise<UserDto | null>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth needs <AuthProvider>');
  return value;
}

/**
 * Restores the session on page load (only if this browser has signed in before): the refresh
 * cookie yields a new access token, then /me yields the user. The access token is never stored.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(session.hasHint() ? 'loading' : 'anonymous');
  const [user, setUser] = useState<UserDto | null>(null);

  useEffect(() => {
    session.onLost(() => {
      setUser(null);
      setStatus('anonymous');
    });
    return () => session.onLost(undefined);
  }, []);

  useEffect(() => {
    if (!session.hasHint()) return;
    let alive = true;
    void (async () => {
      try {
        if (!(await refreshSession())) throw new Error('no session');
        const me = await endpoints.getMe();
        if (alive) {
          setUser(me.user);
          setStatus('authenticated');
        }
      } catch {
        if (alive) {
          setUser(null);
          setStatus('anonymous');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback<AuthApi['login']>(async (identifier, password, removeDeviceId) => {
    const result = await endpoints.login(identifier, password, removeDeviceId);
    session.start(result.accessToken);
    setUser(result.user);
    setStatus('authenticated');
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await endpoints.logout();
    } finally {
      session.clear();
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const reloadUser = useCallback(async () => {
    try {
      const me = await endpoints.getMe();
      setUser(me.user);
      return me.user;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, reloadUser }),
    [status, user, login, logout, reloadUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
