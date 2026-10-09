import { useQueryClient } from '@tanstack/react-query';
import {
  deviceLimitDetailsSchema,
  type DeviceDto,
  type RegisterRequest,
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
import { api, ApiError, client, deviceInfo, onSessionLost } from '../api';
import { setMonitoringUser } from '../monitoring/sentry';
import { signInWithApple, signInWithGoogle } from './social';

export type Phase = 'loading' | 'unreachable' | 'signedOut' | 'signedIn';
export type LoginOutcome = 'ok' | 'deviceLimit' | 'cancelled';

/** Shown on the device-limit screen: the devices to choose from, and how to finish the login. */
export interface DeviceLimitState {
  devices: DeviceDto[];
  /** Repeats the login that was refused, removing this device first. */
  retry: (removeDeviceId: string) => Promise<void>;
}

interface AuthApi {
  phase: Phase;
  user: UserDto | null;
  deviceLimit: DeviceLimitState | null;
  clearDeviceLimit: () => void;
  /** Name from Apple's first sign-in, to prefill the profile form. */
  prefill: { firstName?: string; lastName?: string } | null;
  login: (identifier: string, password: string) => Promise<LoginOutcome>;
  loginWithGoogle: () => Promise<LoginOutcome>;
  loginWithApple: () => Promise<LoginOutcome>;
  register: (body: RegisterRequest) => Promise<void>;
  completeProfile: (body: Parameters<typeof api.completeProfile>[0]) => Promise<void>;
  logout: () => Promise<void>;
  /** Tries to restore the session again (the "no connection" screen). */
  reload: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth needs <AuthProvider>');
  return value;
}

type LoginResult = Awaited<ReturnType<typeof api.login>>;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<UserDto | null>(null);
  const [deviceLimit, setDeviceLimit] = useState<DeviceLimitState | null>(null);
  const [prefill, setPrefill] = useState<AuthApi['prefill']>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  const signedOut = useCallback(() => {
    if (!mounted.current) return;
    queryClient.clear();
    setUser(null);
    setDeviceLimit(null);
    setPhase('signedOut');
    setMonitoringUser(null);
  }, [queryClient]);

  const signedIn = useCallback((next: UserDto) => {
    setUser(next);
    setPhase('signedIn');
    setMonitoringUser(next.id);
  }, []);

  // Start: restore the session from the refresh token in SecureStore.
  useEffect(() => {
    mounted.current = true;
    onSessionLost(signedOut);
    (async () => {
      if (!(await client.hasStoredSession())) return signedOut();
      try {
        await client.refresh();
        const { user: me } = await api.me();
        if (mounted.current) signedIn(me);
      } catch (error) {
        if (!mounted.current) return;
        // No network or a server problem: keep the session and offer a retry.
        // Anything else means the session is gone (onSessionLost already handled a refused token).
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
          setPhase('unreachable');
        } else {
          signedOut();
        }
      }
    })();
    return () => {
      mounted.current = false;
      onSessionLost(undefined);
    };
  }, [attempt, signedOut, signedIn]);

  /**
   * Runs one login call. When the server answers DEVICE_LIMIT, the screen gets the device list
   * and a `retry` that repeats the same call with the chosen device removed.
   */
  const attemptLogin = useCallback(
    async (run: (removeDeviceId?: string) => Promise<LoginResult>): Promise<LoginOutcome> => {
      const finish = async (result: LoginResult) => {
        await client.startSession(result);
        setDeviceLimit(null);
        signedIn(result.user);
      };
      try {
        await finish(await run());
        return 'ok';
      } catch (error) {
        if (error instanceof ApiError && error.code === 'DEVICE_LIMIT') {
          const details = deviceLimitDetailsSchema.safeParse(error.details);
          setDeviceLimit({
            devices: details.success ? details.data.devices : [],
            retry: async (removeDeviceId) => finish(await run(removeDeviceId)),
          });
          return 'deviceLimit';
        }
        throw error;
      }
    },
    [signedIn],
  );

  const login = useCallback<AuthApi['login']>(
    (identifier, password) =>
      attemptLogin(async (removeDeviceId) =>
        api.login({
          ...(await deviceInfo()),
          identifier: identifier.trim(),
          password,
          ...(removeDeviceId ? { removeDeviceId } : {}),
        }),
      ),
    [attemptLogin],
  );

  const loginWithGoogle = useCallback<AuthApi['loginWithGoogle']>(async () => {
    const google = await signInWithGoogle();
    if (!google) return 'cancelled';
    return attemptLogin(async (removeDeviceId) =>
      api.loginWithGoogle({
        ...(await deviceInfo()),
        idToken: google.idToken,
        ...(removeDeviceId ? { removeDeviceId } : {}),
      }),
    );
  }, [attemptLogin]);

  const loginWithApple = useCallback<AuthApi['loginWithApple']>(async () => {
    const apple = await signInWithApple();
    if (!apple) return 'cancelled';
    setPrefill({
      ...(apple.firstName ? { firstName: apple.firstName } : {}),
      ...(apple.lastName ? { lastName: apple.lastName } : {}),
    });
    return attemptLogin(async (removeDeviceId) =>
      api.loginWithApple({
        ...(await deviceInfo()),
        idToken: apple.idToken,
        nonce: apple.nonce,
        ...(removeDeviceId ? { removeDeviceId } : {}),
      }),
    );
  }, [attemptLogin]);

  const register = useCallback<AuthApi['register']>(async (body) => {
    await api.register(body);
  }, []);

  const completeProfile = useCallback<AuthApi['completeProfile']>(
    async (body) => {
      const { user: updated } = await api.completeProfile(body);
      setPrefill(null);
      signedIn(updated);
    },
    [signedIn],
  );

  const logout = useCallback(async () => {
    // The phone forgets the session even if the server cannot be reached.
    await api.logout().catch(() => undefined);
    await client.endSession();
    signedOut();
  }, [signedOut]);

  const value = useMemo<AuthApi>(
    () => ({
      phase,
      user,
      deviceLimit,
      clearDeviceLimit: () => setDeviceLimit(null),
      prefill,
      login,
      loginWithGoogle,
      loginWithApple,
      register,
      completeProfile,
      logout,
      reload: () => {
        setPhase('loading');
        setAttempt((n) => n + 1);
      },
    }),
    [
      phase,
      user,
      deviceLimit,
      prefill,
      login,
      loginWithGoogle,
      loginWithApple,
      register,
      completeProfile,
      logout,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
