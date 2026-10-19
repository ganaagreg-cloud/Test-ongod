// Server data for the signed-in screens (React Query). Keys in one place so a change in one screen
// (a bookmark, an edited profile) updates the others.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { EpisodeDetail, EpisodesPage, EpisodeSort, HomeResponse } from '@ongod/shared';
import { api } from '../api';
import { pagesWithSaved, withSaved } from '../lib/episode';

export interface LibraryFilter {
  category?: string | undefined;
  q?: string | undefined;
  sort: EpisodeSort;
}

export const keys = {
  home: ['home'] as const,
  categories: ['categories'] as const,
  library: (filter: LibraryFilter) => ['library', filter] as const,
  libraryAll: ['library'] as const,
  episode: (id: string) => ['episode', id] as const,
  episodeAll: ['episode'] as const,
  saved: ['saved'] as const,
  stats: ['me', 'stats'] as const,
  devices: ['me', 'devices'] as const,
};

/** Library and saved pages: 20 per request. */
const PAGE = 20;

export const useHome = () => useQuery({ queryKey: keys.home, queryFn: () => api.home() });

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => api.categories(), staleTime: 5 * 60_000 });

export const useLibrary = (filter: LibraryFilter) =>
  useInfiniteQuery({
    queryKey: keys.library(filter),
    queryFn: ({ pageParam }) =>
      api.episodes({ ...filter, limit: PAGE, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useEpisode = (id: string) =>
  useQuery({
    queryKey: keys.episode(id),
    queryFn: () => api.episode(id).then((r) => r.episode),
  });

export const useSavedList = () =>
  useInfiniteQuery({
    queryKey: keys.saved,
    queryFn: ({ pageParam }) => api.saved(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: () => api.stats() });

export const useDevices = () => useQuery({ queryKey: keys.devices, queryFn: () => api.devices() });

/** Sets one episode's bookmark in every cached list; returns how to undo it. */
function setSavedEverywhere(client: QueryClient, id: string, saved: boolean): () => void {
  const touched: Array<[readonly unknown[], unknown]> = [];
  const update = <T>(queryKey: readonly unknown[], change: (data: T) => T) => {
    for (const [key, data] of client.getQueriesData<T>({ queryKey })) {
      if (data === undefined) continue;
      touched.push([key, data]);
      client.setQueryData<T>(key, change(data));
    }
  };
  update<HomeResponse>(keys.home, (home) => ({
    ...home,
    continueListening: withSaved(home.continueListening, id, saved),
    latest: withSaved(home.latest, id, saved),
    thisWeek: withSaved(home.thisWeek, id, saved),
  }));
  update<InfiniteData<EpisodesPage>>(keys.libraryAll, (data) => pagesWithSaved(data, id, saved));
  update<InfiniteData<EpisodesPage>>(keys.saved, (data) => pagesWithSaved(data, id, saved, true));
  update<EpisodeDetail>(keys.episodeAll, (detail) => ({
    ...(detail.id === id ? { ...detail, saved } : detail),
    next: withSaved(detail.next, id, saved),
  }));
  return () => {
    for (const [key, data] of touched) client.setQueryData(key, data);
  };
}

/** The bookmark: shows at once, rolls back if the server refuses. */
export function useToggleSaved() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) =>
      saved ? api.save(id) : api.unsave(id),
    onMutate: async ({ id, saved }) => {
      await client.cancelQueries({ queryKey: keys.saved });
      return { undo: setSavedEverywhere(client, id, saved) };
    },
    onError: (_error, _vars, context) => context?.undo(),
    // A newly saved episode belongs at the top of Хадгалсан: fetch that list again.
    onSettled: (_data, _error, { saved }) => {
      if (saved) void client.invalidateQueries({ queryKey: keys.saved });
    },
  });
}
