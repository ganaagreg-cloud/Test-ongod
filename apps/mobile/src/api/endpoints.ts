import {
  appConfigResponseSchema,
  blockedUsersResponseSchema,
  commentResponseSchema,
  commentsPageSchema,
  type CommentReportReason,
  categoriesResponseSchema,
  completeProfileResponseSchema,
  devicesResponseSchema,
  episodeDetailResponseSchema,
  episodesPageSchema,
  homeResponseSchema,
  loginResponseSchema,
  meResponseSchema,
  meStatsResponseSchema,
  playResponseSchema,
  playlistResponseSchema,
  registerResponseSchema,
  seriesResponseSchema,
  tagsResponseSchema,
  type EpisodeSort,
  type LoginRequest,
  type RegisterRequest,
  type SaveProgressRequest,
  type UpdateProfileRequest,
} from '@ongod/shared';
import type { ApiClient } from './client';

type DeviceInfo = Pick<LoginRequest, 'deviceId' | 'platform' | 'model'>;

/** Query of the library list (GET /v1/episodes). */
export interface EpisodeQuery {
  category?: string | undefined;
  tag?: string | undefined;
  series?: string | undefined;
  q?: string | undefined;
  sort?: EpisodeSort | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** `?a=1&b=2` from the defined values, or '' when there are none. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '',
  );
  if (pairs.length === 0) return '';
  return `?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}`;
}

/**
 * The calls the app needs. Mobile has no payment endpoints (CLAUDE.md, ADR-0006):
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

    /** First page of the newest episodes (the dev audio screen uses it). */
    listEpisodes: (limit = 20) =>
      request(`/episodes?limit=${limit}`, { schema: episodesPageSchema }),

    /** Нүүр: continue listening, newest, categories, this week, the next release. */
    home: () => request('/home', { schema: homeResponseSchema }),

    categories: () => request('/categories', { schema: categoriesResponseSchema }),

    /** Сан: one page of the library (search, category, sort; `cursor` for the next page). */
    episodes: (query: EpisodeQuery = {}) =>
      request(`/episodes${queryString({ ...query })}`, { schema: episodesPageSchema }),

    /** Сан tag chips: tags with at least one published episode. */
    tags: () => request('/tags', { schema: tagsResponseSchema }),

    /** A series with its published parts. */
    series: (id: string) =>
      request(`/series/${encodeURIComponent(id)}`, { schema: seriesResponseSchema }),

    /** A playlist with its published episodes. */
    playlist: (id: string) =>
      request(`/playlists/${encodeURIComponent(id)}`, { schema: playlistResponseSchema }),

    /** Player: the episode with its description and the "Дараагийн" list. */
    episode: (episodeId: string) =>
      request(`/episodes/${encodeURIComponent(episodeId)}`, {
        schema: episodeDetailResponseSchema,
      }),

    /** Хадгалсан: one page of saved episodes, newest saved first. */
    saved: (cursor?: string) =>
      request(`/saved${queryString({ cursor })}`, { schema: episodesPageSchema }),

    save: (episodeId: string) =>
      request(`/saved/${encodeURIComponent(episodeId)}`, { method: 'PUT' }),

    unsave: (episodeId: string) =>
      request(`/saved/${encodeURIComponent(episodeId)}`, { method: 'DELETE' }),

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

    /** Тохиргоо: first name, last name, phone (ADR-0039). */
    updateProfile: (body: UpdateProfileRequest) =>
      request('/me', { method: 'PATCH', body, schema: meResponseSchema }),

    /** Профайл: episodes finished and listening time. */
    stats: () => request('/me/stats', { schema: meStatsResponseSchema }),

    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request('/me/change-password', { method: 'POST', body }),

    /** Sends a code to the new address; `verifyEmailChange` finishes the change. */
    changeEmail: (body: { newEmail: string; password: string }) =>
      request('/me/change-email', { method: 'POST', body }),

    verifyEmailChange: (code: string) =>
      request('/me/change-email/verify', {
        method: 'POST',
        body: { code },
        schema: meResponseSchema,
      }),

    devices: () => request('/me/devices', { schema: devicesResponseSchema }),

    removeDevice: (id: string, password: string) =>
      request(`/me/devices/${encodeURIComponent(id)}`, { method: 'DELETE', body: { password } }),

    /** Soft delete (SPEC H): the server anonymises the account and ends every session. */
    deleteAccount: () => request('/me', { method: 'DELETE' }),

    /** This phone's Expo push token, or null to stop push here (ADR-0055). */
    setPushToken: (token: string | null) =>
      request('/me/push-token', { method: 'PUT', body: { token } }),

    // ---- Сэтгэгдэл (SPEC L, ADR-0061) ----

    comments: (episodeId: string, cursor?: string) =>
      request(`/episodes/${encodeURIComponent(episodeId)}/comments${queryString({ cursor })}`, {
        schema: commentsPageSchema,
      }),

    postComment: (episodeId: string, body: string) =>
      request(`/episodes/${encodeURIComponent(episodeId)}/comments`, {
        method: 'POST',
        body: { body },
        schema: commentResponseSchema,
      }),

    editComment: (id: string, body: string) =>
      request(`/comments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { body },
        schema: commentResponseSchema,
      }),

    deleteComment: (id: string) =>
      request(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    reportComment: (id: string, reason: CommentReportReason) =>
      request(`/comments/${encodeURIComponent(id)}/report`, { method: 'POST', body: { reason } }),

    /** Blocks the author of this comment: their comments vanish from this user's lists. */
    blockCommentAuthor: (id: string) =>
      request(`/comments/${encodeURIComponent(id)}/block`, { method: 'POST' }),

    blockedUsers: () => request('/me/blocks', { schema: blockedUsersResponseSchema }),

    unblockUser: (userId: string) =>
      request(`/me/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

    logout: async () => {
      const refreshToken = await client.getRefreshToken();
      if (refreshToken) {
        await request('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
      }
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
