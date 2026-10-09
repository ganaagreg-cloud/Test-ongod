import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  adminCategoriesResponseSchema,
  adminCategoryResponseSchema,
  adminEpisodeResponseSchema,
  adminEpisodesPageSchema,
  adminSubscriptionResponseSchema,
  adminSubscriptionsPageSchema,
  adminUserDetailResponseSchema,
  adminUsersPageSchema,
  auditPageSchema,
  dashboardResponseSchema,
  historyResponseSchema,
  plansResponseSchema,
  type ListAdminEpisodesQuery,
  type ListSubscriptionsQuery,
  type SubscriptionStatus,
} from '@ongod/shared';
import { api, apiBlob } from './client';

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
  status: SubscriptionStatus;
};

export const subscriptionsQuery = (filter: SubscriptionsFilter) =>
  queryOptions({
    queryKey: ['subscriptions', filter],
    queryFn: ({ signal }) =>
      api(`/admin/subscriptions${qs(filter)}`, { schema: adminSubscriptionsPageSchema, signal }),
    placeholderData: keepPreviousData,
    // The queue refreshes by itself: new payments appear while the admin works.
    refetchInterval: filter.status === 'PAYMENT_SUBMITTED' ? 30_000 : false,
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

export type EpisodesFilter = Partial<Omit<ListAdminEpisodesQuery, 'limit'>>;

export const episodesQuery = (filter: EpisodesFilter) =>
  queryOptions({
    queryKey: ['episodes', filter],
    queryFn: ({ signal }) =>
      api(`/admin/episodes${qs(filter)}`, { schema: adminEpisodesPageSchema, signal }),
    placeholderData: keepPreviousData,
  });

/** Refreshes by itself while the server is still working on the audio. */
export const episodeQuery = (id: string) =>
  queryOptions({
    queryKey: ['episode', id],
    queryFn: ({ signal }) =>
      api(`/admin/episodes/${id}`, { schema: adminEpisodeResponseSchema, signal }),
    refetchInterval: (query) => {
      const status = query.state.data?.episode.media?.status;
      return status === 'UPLOADING' || status === 'PROCESSING' ? 3000 : false;
    },
  });

// ---- Hooks for the receipt image and the CSV ----

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * The receipt image sits behind the login, so it is fetched with the token. It comes back as a
 * data URL (at most 5 MB): nothing to revoke later, and it survives React re-mounts.
 */
export function useReceiptImage(subscriptionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['receipt', subscriptionId],
    enabled: enabled && subscriptionId !== undefined,
    queryFn: async ({ signal }) =>
      toDataUrl((await apiBlob(`/admin/subscriptions/${subscriptionId}/receipt`, signal)).blob),
    staleTime: Infinity,
    gcTime: 60_000,
  });
}

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
  const approve = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/subscriptions/${id}/approve`, {
        method: 'POST',
        schema: adminSubscriptionResponseSchema,
      }),
    onSuccess: done,
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api(`/admin/subscriptions/${v.id}/reject`, {
        method: 'POST',
        body: { reason: v.reason },
        schema: adminSubscriptionResponseSchema,
      }),
    onSuccess: done,
  });
  const revoke = useMutation({
    mutationFn: (v: { id: string; reason: string; refund: boolean }) =>
      api(`/admin/subscriptions/${v.id}/revoke`, {
        method: 'POST',
        body: { reason: v.reason, refund: v.refund },
        schema: adminSubscriptionResponseSchema,
      }),
    onSuccess: done,
  });
  return { approve, reject, revoke };
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
  return { create, update, remove, reorder };
}

type Transition = 'publish' | 'unschedule' | 'archive' | 'restore' | 'media/retry';

export function useEpisodeActions(episodeId: string | undefined) {
  const invalidate = useInvalidate();
  const done = () => invalidate('episode', 'episodes', 'categories', 'dashboard');
  const create = useMutation({
    mutationFn: (v: { title: string; description: string; categoryId: string }) =>
      api('/admin/episodes', { method: 'POST', body: v, schema: adminEpisodeResponseSchema }),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: (v: { title: string; description: string; categoryId: string }) =>
      api(`/admin/episodes/${episodeId}`, {
        method: 'PATCH',
        body: v,
        schema: adminEpisodeResponseSchema,
      }),
    onSuccess: done,
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
  return { create, update, remove, transition, schedule, uploadCover };
}
