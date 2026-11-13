import { useQueryClient } from '@tanstack/react-query';
import { loginResponseSchema, meResponseSchema, type UserDto } from '@ongod/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, deviceId, refreshSession, session } from '../api/client';

const IDLE_LOGOUT_MS = 30 * 60 * 1000;

/**
 * Where the admin is on the way in (SPEC: roles ADMIN and OWNER, password login only, ADR-0040):
 * password login -> role check -> the app.
 */
export type Gate =
  | { stage: 'loading' }
  | { stage: 'anonymous' }
  | { stage: 'forbidden'; user: UserDto }
  | { stage: 'ready'; user: UserDto };

interface AuthApi {
  gate: Gate;
  login: (input: {
    identifier: string;
    password: string;
    removeDeviceId?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth needs <AuthProvider>');
  return value;
}

/** The signed-in admin; only call inside the app, after the gate is `ready`. */
export function useAdmin(): UserDto {
  const { gate } = useAuth();
  if (gate.stage !== 'ready') throw new Error('useAdmin needs a ready session');
  return gate.user;
}

function gateFor(user: UserDto): Gate {
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') return { stage: 'forbidden', user };
  return { stage: 'ready', user };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [gate, setGate] = useState<Gate>({ stage: 'loading' });

  const signedOut = useCallback(() => {
    session.clear();
    queryClient.clear();
    setGate({ stage: 'anonymous' });
  }, [queryClient]);

  // A page load restores the session through the refresh cookie.
  useEffect(() => {
    session.onLost(signedOut);
    let cancelled = false;
    (async () => {
      if (!session.hasHint() || !(await refreshSession())) {
        if (!cancelled) setGate({ stage: 'anonymous' });
        return;
      }
      const { user } = await api('/me', { schema: meResponseSchema });
      const next = gateFor(user);
      if (!cancelled) setGate(next);
    })().catch(() => {
      if (!cancelled) setGate({ stage: 'anonymous' });
    });
    return () => {
      cancelled = true;
      session.onLost(undefined);
    };
  }, [signedOut]);

  const login = useCallback<AuthApi['login']>(async ({ identifier, password, removeDeviceId }) => {
    const res = await api('/auth/login', {
      method: 'POST',
      body: {
        identifier,
        password,
        deviceId: deviceId(),
        platform: 'admin',
        model: navigator.userAgent.slice(0, 100),
        ...(removeDeviceId ? { removeDeviceId } : {}),
      },
      schema: loginResponseSchema,
      auth: false,
    });
    session.start(res.accessToken);
    setGate(gateFor(res.user));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: { platform: 'admin' } });
    } catch {
      // The local session is dropped either way.
    }
    signedOut();
  }, [signedOut]);

  // ADR-0105: 30 minutes without a click, key press, scroll or touch signs the admin out.
  // shortcut: per tab and client side only, a closed tab keeps its refresh cookie until it expires; add a server idle limit if that matters.
  useEffect(() => {
    if (gate.stage !== 'ready') return;
    let timer = 0;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void logout(), IDLE_LOGOUT_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    reset();
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [gate.stage, logout]);

  const value = useMemo<AuthApi>(() => ({ gate, login, logout }), [gate, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
