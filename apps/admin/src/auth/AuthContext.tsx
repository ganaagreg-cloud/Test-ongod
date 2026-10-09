import { useQueryClient } from '@tanstack/react-query';
import {
  loginResponseSchema,
  meResponseSchema,
  totpSetupResponseSchema,
  totpStatusResponseSchema,
  type UserDto,
} from '@ongod/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, deviceId, refreshSession, session } from '../api/client';

/**
 * Where the admin is on the way in (SPEC: roles ADMIN and OWNER, TOTP 2FA required, ADR-0022):
 * password login -> role check -> authenticator setup (first time) or code -> the app.
 */
export type Gate =
  | { stage: 'loading' }
  | { stage: 'anonymous' }
  | { stage: 'forbidden'; user: UserDto }
  | { stage: 'totp-setup'; user: UserDto }
  | { stage: 'totp-verify'; user: UserDto }
  | { stage: 'ready'; user: UserDto };

interface AuthApi {
  gate: Gate;
  login: (input: {
    identifier: string;
    password: string;
    removeDeviceId?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /** Fetches the QR data for the first-time setup. */
  startTotpSetup: () => Promise<{ secret: string; otpauthUri: string }>;
  verifyTotp: (code: string) => Promise<void>;
  /** Re-reads the 2FA state, e.g. after the API said TOTP_REQUIRED mid-session. */
  recheck: () => Promise<void>;
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

async function gateFor(user: UserDto): Promise<Gate> {
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') return { stage: 'forbidden', user };
  const status = await api('/admin/totp', { schema: totpStatusResponseSchema });
  if (!status.enabled) return { stage: 'totp-setup', user };
  return status.verified ? { stage: 'ready', user } : { stage: 'totp-verify', user };
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
      const next = await gateFor(user);
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
    setGate(await gateFor(res.user));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: { platform: 'admin' } });
    } catch {
      // The local session is dropped either way.
    }
    signedOut();
  }, [signedOut]);

  // One setup request at a time: two calls would each replace the stored secret, and the QR code
  // on screen would no longer match the one the server keeps.
  const setupRequest = useRef<ReturnType<AuthApi['startTotpSetup']>>(undefined);
  const startTotpSetup = useCallback(() => {
    setupRequest.current ??= api('/admin/totp/setup', {
      method: 'POST',
      schema: totpSetupResponseSchema,
    }).finally(() => {
      setupRequest.current = undefined;
    });
    return setupRequest.current;
  }, []);

  const recheck = useCallback(async () => {
    const { user } = await api('/me', { schema: meResponseSchema });
    setGate(await gateFor(user));
  }, []);

  useEffect(() => {
    session.onTotpNeeded(() => void recheck().catch(() => undefined));
    return () => session.onTotpNeeded(undefined);
  }, [recheck]);

  const verifyTotp = useCallback(
    async (code: string) => {
      await api('/admin/totp/verify', { method: 'POST', body: { code } });
      await recheck();
    },
    [recheck],
  );

  const value = useMemo<AuthApi>(
    () => ({ gate, login, logout, startTotpSetup, verifyTotp, recheck }),
    [gate, login, logout, startTotpSetup, verifyTotp, recheck],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
