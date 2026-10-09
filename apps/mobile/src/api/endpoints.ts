import {
  appConfigResponseSchema,
  completeProfileResponseSchema,
  episodesPageSchema,
  loginResponseSchema,
  meResponseSchema,
  playResponseSchema,
  registerResponseSchema,
  type LoginRequest,
  type RegisterRequest,
  type SaveProgressRequest,
} from '@ongod/shared';
import type { ApiClient } from './client';

type DeviceInfo = Pick<LoginRequest, 'deviceId' | 'platform' | 'model'>;

/**
 * The calls the sign-in screens need. Mobile has no payment endpoints (CLAUDE.md, ADR-0006):
 * this file must never grow plans, subscriptions or bank details.
 */
export function createEndpoints(client: ApiClient) {
  const { request } = client;
  return {
    appConfig: (signal?: AbortSignal) =>
      request('/app-config', {
        auth: false,
        // Start-up must not hang on a bad connection.
        timeoutMs: 8000,
        schema: appConfigResponseSchema,
        ...(signal ? { signal } : {}),
      }),

    register: (body: RegisterRequest) =>
      request('/auth/register', {
        method: 'POST',
        body,
        auth: false,
        schema: registerResponseSchema,
      }),

    verifyEmail: (body: { email: string; code: string }) =>
      request('/auth/verify-email', { method: 'POST', body, auth: false }),

    resendCode: (email: string) =>
      request('/auth/resend-code', { method: 'POST', body: { email }, auth: false }),

    login: (body: DeviceInfo & { identifier: string; password: string; removeDeviceId?: string }) =>
      request('/auth/login', { method: 'POST', body, auth: false, schema: loginResponseSchema }),

    loginWithGoogle: (
      body: DeviceInfo & { idToken: string; nonce?: string; removeDeviceId?: string },
    ) =>
      request('/auth/google', { method: 'POST', body, auth: false, schema: loginResponseSchema }),

    loginWithApple: (
      body: DeviceInfo & { idToken: string; nonce: string; removeDeviceId?: string },
    ) => request('/auth/apple', { method: 'POST', body, auth: false, schema: loginResponseSchema }),

    forgotPassword: (email: string) =>
      request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),

    resetPassword: (body: { email: string; code: string; newPassword: string }) =>
      request('/auth/reset-password', { method: 'POST', body, auth: false }),

    completeProfile: (body: {
      username: string;
      password: string;
      lastName: string;
      firstName: string;
      phone: string;
    }) =>
      request('/auth/complete-profile', {
        method: 'POST',
        body,
        schema: completeProfileResponseSchema,
      }),

    /** First page of the newest episodes (library list; the dev audio screen uses it). */
    listEpisodes: (limit = 20) =>
      request(`/episodes?limit=${limit}`, { schema: episodesPageSchema }),

    /** The signed audio URL of an episode (a bearer credential: never log it). */
    playEpisode: (episodeId: string) =>
      request(`/episodes/${encodeURIComponent(episodeId)}/play`, {
        method: 'POST',
        schema: playResponseSchema,
      }),

    /** Listening progress (ADR-0021: whole seconds, last write wins). */
    saveProgress: (episodeId: string, body: SaveProgressRequest) =>
      request(`/progress/${encodeURIComponent(episodeId)}`, { method: 'PUT', body }),

    me: (signal?: AbortSignal) =>
      request('/me', { schema: meResponseSchema, ...(signal ? { signal } : {}) }),

    logout: async () => {
      const refreshToken = await client.getRefreshToken();
      if (refreshToken) {
        await request('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
      }
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
