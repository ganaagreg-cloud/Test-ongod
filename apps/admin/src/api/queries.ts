import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminCategoriesResponseSchema,
  adminCategoryResponseSchema,
  adminEpisodeResponseSchema,
  adminEpisodesPageSchema,
  adminGiftResponseSchema,
  adminGiftsPageSchema,
  adminPlanResponseSchema,
  adminPlansResponseSchema,
  adminPlaylistDetailResponseSchema,
  adminPlaylistListResponseSchema,
  adminSeriesDetailResponseSchema,
  adminSeriesListResponseSchema,
  adminTagResponseSchema,
  adminTagsResponseSchema,
  bulkResponseSchema,
  previewResponseSchema,
  adminSubscriptionResponseSchema,
  adminSubscriptionsPageSchema,
  adminUserDetailResponseSchema,
  adminUsersPageSchema,
  auditPageSchema,
  dashboardResponseSchema,
  historyResponseSchema,
  plansResponseSchema,
  type BulkAction,
  type GiftStatus,
  type CreatePlanRequest,
  type UpdatePlanRequest,
  type CreateEpisodeRequest,
  type CreatePlaylistRequest,
  type CreateSeriesRequest,
  type ListAdminEpisodesQuery,
  type AdminStatusFilter,
  type ListSubscriptionsQuery,
  type UpdateEpisodeRequest,
  type UpdatePlaylistRequest,
  type UpdateSeriesRequest,
} from '@ongod/shared';
import { mn } from '../i18n/mn';
import { api, apiBlob, ApiError } from './client';

type Params = Record<string, string | number | undefined>;

function qs(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ---- Query option factories (one place for keys, so invalidation stays correct) ----

export const dashboardQuery = () =>
  queryOptions({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => api('/admin/dashboard', { schema: dashboardResponseSchema, signal }),
    refetchInterval: 30_000,
  });

export type SubscriptionsFilter = Partial<Omit<ListSubscriptionsQuery, 'status'>> & {
  status: AdminStatusFilter;
};

export const subscriptionsQuery = (filter: SubscriptionsFilter) =>
  queryOptions({
    queryKey: ['subscriptions', filter],
    queryFn: ({ signal }) =>
      api(`/admin/subscriptions${qs(filter)}`, { schema: adminSubscriptionsPageSchema, signal }),
    placeholderData: keepPreviousData,
  });

export const subscriptionHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: ['subscription-history', id],
    queryFn: ({ signal }) =>
      api(`/admin/subscriptions/${id}/history`, { schema: historyResponseSchema, signal }),
  });

export const usersQuery = (filter: { q?: string; page: number }) =>
  queryOptions({
    queryKey: ['users', filter],
    queryFn: ({ signal }) =>
      api(`/admin/users${qs(filter)}`, { schema: adminUsersPageSchema, signal }),
    placeholderData: keepPreviousData,
  });

export const userQuery = (id: string) =>
  queryOptions({
    queryKey: ['user', id],
    queryFn: ({ signal }) =>
      api(`/admin/users/${id}`, { schema: adminUserDetailResponseSchema, signal }),
  });

export const plansQuery = () =>
  queryOptions({
    queryKey: ['plans'],
    queryFn: ({ signal }) => api('/plans', { schema: plansResponseSchema, auth: false, signal }),
    staleTime: 5 * 60_000,
  });

// ---- Gifts (SPEC J, ADR-0060) ----

export const giftsQuery = (filter: { status: GiftStatus; q?: string; page: number }) =>
  queryOptions({
    queryKey: ['gifts', filter],
    queryFn: ({ signal }) =>
      api(`/admin/gifts${qs(filter)}`, { schema: adminGiftsPageSchema, signal }),
    placeholderData: keepPreviousData,
  });

export function useVoidGift() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api(`/admin/gifts/${v.id}/void`, {
        method: 'POST',
        body: { reason: v.reason },
        schema: adminGiftResponseSchema,
      }),
    onSuccess: () => invalidate('gifts', 'audit'),
  });
}

// ---- Plans (SPEC K, ADR-0059) ----

export const adminPlansQuery = () =>
  queryOptions({
    queryKey: ['admin-plans'],
    queryFn: ({ signal }) => api('/admin/plans', { schema: adminPlansResponseSchema, signal }),
  });

export function usePlanActions() {
  const invalidate = useInvalidate();
  // 'plans' is the public list the grant dialog uses.
  const done = () => invalidate('admin-plans', 'plans');
  const create = useMutation({
    mutationFn: (v: CreatePlanRequest) =>
      api('/admin/plans', { method: 'POST', body: v, schema: adminPlanResponseSchema }),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: UpdatePlanRequest & { id: string }) =>
      api(`/admin/plans/${id}`, { method: 'PATCH', body, schema: adminPlanResponseSchema }),
    onSuccess: done,
  });
  return { create, update };
}

export const auditQuery = (filter: { action?: string; targetType?: string; page: number }) =>
  queryOptions({
    queryKey: ['audit', filter],
    queryFn: ({ signal }) => api(`/admin/audit${qs(filter)}`, { schema: auditPageSchema, signal }),
    placeholderData: keepPreviousData,
  });

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ['categories'],
    queryFn: ({ signal }) =>
      api('/admin/categories', { schema: adminCategoriesResponseSchema, signal }),
  });

export type EpisodesFilter = Partial<ListAdminEpisodesQuery>;

export const episodesQuery = (filter: EpisodesFilter) =>
  queryOptions({
    queryKey: ['episodes', filter],
    queryFn: ({ signal }) =>
      api(`/admin/episodes${qs(filter)}`, { schema: adminEpisodesPageSchema, signal }),
    placeholderData: keepPreviousData,
  });

/** Refreshes by itself while the server is still working on the file (video: Bunny encodes for minutes). */
export const episodeQuery = (id: string) =>
  queryOptions({
    queryKey: ['episode', id],
    queryFn: ({ signal }) =>
      api(`/admin/episodes/${id}`, { schema: adminEpisodeResponseSchema, signal }),
    refetchInterval: (query) => {
      const media = query.state.data?.episode.media;
      if (media?.status !== 'UPLOADING' && media?.status !== 'PROCESSING') return false;
      return media.kind === 'VIDEO' && media.status === 'PROCESSING' ? 10_000 : 3000;
    },
  });

// ---- The CSV ----

export async function downloadPaymentsCsv(range: { from?: string; to?: string }) {
  const { blob, filename } = await apiBlob(`/admin/payments.csv${qs(range)}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? 'payments.csv';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- Mutations ----

export function useInvalidate() {
  const client = useQueryClient();
  return (...keys: string[]) =>
    Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })));
}

export function useDecisions() {
  const invalidate = useInvalidate();
  const done = () =>
    invalidate('subscriptions', 'subscription-history', 'dashboard', 'user', 'audit');
  const revoke = useMutation({
    mutationFn: (v: { id: string; reason: string; refund: boolean }) =>
      api(`/admin/subscriptions/${v.id}/revoke`, {
        method: 'POST',
        body: { reason: v.reason, refund: v.refund },
        schema: adminSubscriptionResponseSchema,
      }),
    onSuccess: done,
  });
  return { revoke };
}

export function useUserActions(userId: string) {
  const invalidate = useInvalidate();
  const done = () => invalidate('user', 'users', 'dashboard', 'audit');
  const grant = useMutation({
    mutationFn: (v: { planId: string; days?: number; note?: string }) =>
      api(`/admin/users/${userId}/grants`, {
        method: 'POST',
        body: v,
        schema: adminSubscriptionResponseSchema,
      }),
    onSuccess: done,
  });
  const removeDevice = useMutation({
    mutationFn: (deviceId: string) =>
      api(`/admin/users/${userId}/devices/${deviceId}`, { method: 'DELETE' }),
    onSuccess: done,
  });
  return { grant, removeDevice };
}

export function useCategoryActions() {
  const invalidate = useInvalidate();
  const done = () => invalidate('categories', 'episodes');
  const create = useMutation({
    mutationFn: (v: { name: string; slug: string }) =>
      api('/admin/categories', { method: 'POST', body: v, schema: adminCategoryResponseSchema }),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; name: string; slug: string }) =>
      api(`/admin/categories/${v.id}`, {
        method: 'PATCH',
        body: { name: v.name, slug: v.slug },
        schema: adminCategoryResponseSchema,
      }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: done,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api('/admin/categories/reorder', {
        method: 'POST',
        body: { ids },
        schema: adminCategoriesResponseSchema,
      }),
    onSuccess: done,
  });
  const uploadCover = useMutation({
    mutationFn: (v: { id: string; file: File }) =>
      api(`/admin/categories/${v.id}/cover`, {
        method: 'POST',
        form: coverForm(v.file),
        schema: adminCategoryResponseSchema,
      }),
    onSettled: done,
  });
  return { create, update, remove, reorder, uploadCover };
}

type Transition = 'publish' | 'unschedule' | 'archive' | 'unarchive' | 'restore' | 'media/retry';

export function useEpisodeActions(episodeId: string | undefined) {
  const invalidate = useInvalidate();
  const done = () => invalidate('episode', 'episodes', 'categories', 'dashboard');
  const create = useMutation({
    mutationFn: (v: CreateEpisodeRequest) =>
      api('/admin/episodes', { method: 'POST', body: v, schema: adminEpisodeResponseSchema }),
    onSettled: done,
  });
  const update = useMutation({
    mutationFn: (v: UpdateEpisodeRequest) =>
      api(`/admin/episodes/${episodeId}`, {
        method: 'PATCH',
        body: v,
        schema: adminEpisodeResponseSchema,
      }),
    onSettled: done,
  });
  /** A draft copy; the server adds "(хуулбар)" to the title. */
  const duplicate = useMutation({
    mutationFn: () =>
      api(`/admin/episodes/${episodeId}/duplicate`, {
        method: 'POST',
        schema: adminEpisodeResponseSchema,
      }),
    onSettled: done,
  });
  /** A short-lived signed link to the media file (never cached: it expires). */
  const preview = useMutation({
    mutationFn: () =>
      api(`/admin/episodes/${episodeId}/preview`, {
        method: 'POST',
        schema: previewResponseSchema,
      }),
  });
  const remove = useMutation({
    mutationFn: () => api(`/admin/episodes/${episodeId}`, { method: 'DELETE' }),
    onSuccess: done,
  });
  const transition = useMutation({
    mutationFn: (action: Transition) =>
      api(`/admin/episodes/${episodeId}/${action}`, {
        method: 'POST',
        schema: adminEpisodeResponseSchema,
      }),
    onSuccess: done,
  });
  const schedule = useMutation({
    mutationFn: (scheduledFor: string) =>
      api(`/admin/episodes/${episodeId}/schedule`, {
        method: 'POST',
        body: { scheduledFor },
        schema: adminEpisodeResponseSchema,
      }),
    onSuccess: done,
  });
  const uploadCover = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('cover', file);
      return api(`/admin/episodes/${episodeId}/cover`, {
        method: 'POST',
        form,
        schema: adminEpisodeResponseSchema,
      });
    },
    onSuccess: done,
  });
  return { create, update, duplicate, preview, remove, transition, schedule, uploadCover };
}

/** The undo of an archive: published again with the same date and no push (one call per item). */
export function useUnarchive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((id) =>
          api(`/admin/episodes/${id}/unarchive`, {
            method: 'POST',
            schema: adminEpisodeResponseSchema,
          }),
        ),
      ),
    onSettled: () => invalidate('episodes', 'episode', 'categories', 'dashboard'),
  });
}

// ---- Tags, series and playlists (ADR-0042) ----

export const tagsQuery = () =>
  queryOptions({
    queryKey: ['tags'],
    queryFn: ({ signal }) => api('/admin/tags', { schema: adminTagsResponseSchema, signal }),
  });

export function useTagActions() {
  const invalidate = useInvalidate();
  const done = () => invalidate('tags', 'episodes', 'episode');
  const create = useMutation({
    mutationFn: (v: { name: string }) =>
      api('/admin/tags', { method: 'POST', body: v, schema: adminTagResponseSchema }),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      api(`/admin/tags/${v.id}`, {
        method: 'PATCH',
        body: { name: v.name },
        schema: adminTagResponseSchema,
      }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/tags/${id}`, { method: 'DELETE' }),
    onSuccess: done,
  });
  return { create, update, remove };
}

/** One action on up to 100 items at once (all or nothing on the server). */
export function useBulkEpisodes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { ids: string[]; action: BulkAction }) =>
      api('/admin/episodes/bulk', { method: 'POST', body: v, schema: bulkResponseSchema }),
    onSettled: () =>
      invalidate('episodes', 'episode', 'playlists', 'series', 'tags', 'categories', 'dashboard'),
  });
}

function coverForm(file: File): FormData {
  const form = new FormData();
  form.append('cover', file);
  return form;
}

export const seriesListQuery = () =>
  queryOptions({
    queryKey: ['series', 'list'],
    queryFn: ({ signal }) =>
      api('/admin/series', { schema: adminSeriesListResponseSchema, signal }),
  });

export const seriesQuery = (id: string) =>
  queryOptions({
    queryKey: ['series', 'detail', id],
    queryFn: ({ signal }) =>
      api(`/admin/series/${id}`, { schema: adminSeriesDetailResponseSchema, signal }),
  });

/** `seriesId` is undefined on the create screen. */
export function useSeriesActions(seriesId: string | undefined) {
  const invalidate = useInvalidate();
  const done = () => invalidate('series', 'episodes', 'episode');
  const create = useMutation({
    mutationFn: (v: CreateSeriesRequest) =>
      api('/admin/series', {
        method: 'POST',
        body: v,
        schema: adminSeriesDetailResponseSchema,
      }),
    onSettled: done,
  });
  const update = useMutation({
    mutationFn: (v: UpdateSeriesRequest) =>
      api(`/admin/series/${seriesId}`, {
        method: 'PATCH',
        body: v,
        schema: adminSeriesDetailResponseSchema,
      }),
    onSettled: done,
  });
  const remove = useMutation({
    mutationFn: () => api(`/admin/series/${seriesId}`, { method: 'DELETE' }),
    onSettled: done,
  });
  const reorder = useMutation({
    mutationFn: (episodeIds: string[]) =>
      api(`/admin/series/${seriesId}/reorder`, {
        method: 'POST',
        body: { episodeIds },
        schema: adminSeriesDetailResponseSchema,
      }),
    onSettled: done,
  });
  /** One after the other: each item takes the next free part number. */
  const addItems = useMutation({
    mutationFn: async (episodeIds: string[]) => {
      let added = 0;
      for (const id of episodeIds) {
        try {
          await api(`/admin/episodes/${id}`, {
            method: 'PATCH',
            body: { seriesId },
            schema: adminEpisodeResponseSchema,
          });
          added += 1;
        } catch (err) {
          // Say how far it got: the earlier ones are already in the series.
          if (added > 0 && err instanceof ApiError) {
            throw new ApiError(
              err.status,
              err.code,
              mn.series.items.partialAdded(added, episodeIds.length, err.message),
            );
          }
          throw err;
        }
      }
    },
    onSettled: done,
  });
  const removeItem = useMutation({
    mutationFn: (episodeId: string) =>
      api(`/admin/episodes/${episodeId}`, {
        method: 'PATCH',
        body: { seriesId: null },
        schema: adminEpisodeResponseSchema,
      }),
    onSettled: done,
  });
  const uploadCover = useMutation({
    mutationFn: (file: File) =>
      api(`/admin/series/${seriesId}/cover`, {
        method: 'POST',
        form: coverForm(file),
        schema: adminSeriesDetailResponseSchema,
      }),
    onSettled: done,
  });
  return { create, update, remove, reorder, addItems, removeItem, uploadCover };
}

export const playlistsQuery = () =>
  queryOptions({
    queryKey: ['playlists', 'list'],
    queryFn: ({ signal }) =>
      api('/admin/playlists', { schema: adminPlaylistListResponseSchema, signal }),
  });

export const playlistQuery = (id: string) =>
  queryOptions({
    queryKey: ['playlists', 'detail', id],
    queryFn: ({ signal }) =>
      api(`/admin/playlists/${id}`, { schema: adminPlaylistDetailResponseSchema, signal }),
  });

/** `playlistId` is undefined on the create screen and the list. */
export function usePlaylistActions(playlistId: string | undefined) {
  const invalidate = useInvalidate();
  const done = () => invalidate('playlists', 'episodes');
  const create = useMutation({
    mutationFn: (v: CreatePlaylistRequest) =>
      api('/admin/playlists', {
        method: 'POST',
        body: v,
        schema: adminPlaylistDetailResponseSchema,
      }),
    onSettled: done,
  });
  const update = useMutation({
    mutationFn: (v: UpdatePlaylistRequest) =>
      api(`/admin/playlists/${playlistId}`, {
        method: 'PATCH',
        body: v,
        schema: adminPlaylistDetailResponseSchema,
      }),
    onSettled: done,
  });
  /** Takes the id itself: the list deletes any row. */
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/playlists/${id}`, { method: 'DELETE' }),
    onSettled: done,
  });
  const addItems = useMutation({
    mutationFn: (episodeIds: string[]) =>
      api(`/admin/playlists/${playlistId}/items`, {
        method: 'POST',
        body: { episodeIds },
        schema: adminPlaylistDetailResponseSchema,
      }),
    onSettled: done,
  });
  const removeItem = useMutation({
    mutationFn: (episodeId: string) =>
      api(`/admin/playlists/${playlistId}/items/${episodeId}`, {
        method: 'DELETE',
        schema: adminPlaylistDetailResponseSchema,
      }),
    onSettled: done,
  });
  const reorder = useMutation({
    mutationFn: (episodeIds: string[]) =>
      api(`/admin/playlists/${playlistId}/reorder`, {
        method: 'POST',
        body: { episodeIds },
        schema: adminPlaylistDetailResponseSchema,
      }),
    onSettled: done,
  });
  const reorderHome = useMutation({
    mutationFn: (playlistIds: string[]) =>
      api('/admin/playlists/home-order', {
        method: 'POST',
        body: { playlistIds },
        schema: adminPlaylistListResponseSchema,
      }),
    onSettled: done,
  });
  const uploadCover = useMutation({
    mutationFn: (file: File) =>
      api(`/admin/playlists/${playlistId}/cover`, {
        method: 'POST',
        form: coverForm(file),
        schema: adminPlaylistDetailResponseSchema,
      }),
    onSettled: done,
  });
  return { create, update, remove, addItems, removeItem, reorder, reorderHome, uploadCover };
}
