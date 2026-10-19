import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import type { EpisodeSort } from '@ongod/shared';
import { layout, nativeTextStyle, spacing, themes } from '@ongod/tokens';
import { useCategories, useLibrary } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { EpisodeList } from '../../../src/screens/EpisodeList';
import { useDebounced, useHold } from '../../../src/screens/hooks';
import { useBottomSpace } from '../../../src/screens/layout';
import { openPlayer } from '../../../src/screens/navigation';
import {
  Button,
  ChipRow,
  EmptyState,
  SearchField,
  Segmented,
  SurfaceProvider,
} from '../../../src/ui';

const ALL = 'all';
/** Typing pauses this long before searching. */
const SEARCH_DEBOUNCE_MS = 300;
/** DESIGN "Сан": a 650 ms skeleton on every filter change. */
const FILTER_SKELETON_MS = 650;

const SORTS: Array<{ id: EpisodeSort; label: string }> = [
  { id: 'newest', label: mn.library.sortNewest },
  { id: 'oldest', label: mn.library.sortOldest },
  { id: 'longest', label: mn.library.sortLongest },
];

/** Сан (CREAM): search, category chips, sort, 4:3 rows, more on scroll (Library.dc.html). */
export default function Library() {
  const params = useLocalSearchParams<{ category?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const categories = useCategories();
  const [category, setCategory] = useState(params.category ?? ALL);
  const [text, setText] = useState('');
  const [sort, setSort] = useState<EpisodeSort>('newest');
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebounced(text.trim(), SEARCH_DEBOUNCE_MS);

  // A category card on Нүүр opens this tab with ?category=<slug> (adjusted while rendering, the
  // React way to follow a changed prop).
  const [seenParam, setSeenParam] = useState(params.category);
  if (params.category !== seenParam) {
    setSeenParam(params.category);
    if (params.category) setCategory(params.category);
  }

  // Cream screen: dark status bar text while this tab is shown.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark');
      return () => setStatusBarStyle('light');
    }, []),
  );

  const filter = useMemo(
    () => ({ category: category === ALL ? undefined : category, q: q || undefined, sort }),
    [category, q, sort],
  );
  const list = useLibrary(filter);
  const held = useHold(`${category}|${q}|${sort}`, FILTER_SKELETON_MS);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);

  const chips = [
    { id: ALL, label: mn.library.all },
    ...(categories.data?.categories ?? []).map((c) => ({ id: c.slug, label: c.name })),
  ];
  const filtered = category !== ALL || q !== '';

  const refresh = async () => {
    setRefreshing(true);
    await list.refetch().catch(() => undefined);
    setRefreshing(false);
  };

  const header = (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        {mn.library.title}
      </Text>
      <SearchField
        value={text}
        onChangeText={setText}
        label={mn.library.search}
        placeholder={mn.library.searchPlaceholder}
        clearLabel={mn.library.clear}
      />
      <View style={styles.bleed}>
        <ChipRow items={chips} value={category} onChange={setCategory} />
      </View>
      <Segmented
        items={SORTS}
        value={sort}
        onChange={(id) => setSort(id as EpisodeSort)}
        label={mn.library.sort}
      />
    </View>
  );

  const empty = list.isError ? (
    <EmptyState
      title={mn.episode.loadError}
      action={
        <Button label={mn.common.retry} variant="secondary" onPress={() => void list.refetch()} />
      }
    />
  ) : (
    <EmptyState
      title={mn.library.emptyTitle}
      text={mn.library.emptyText}
      action={
        filtered ? (
          <Button
            label={mn.library.clear}
            variant="secondary"
            onPress={() => {
              setText('');
              setCategory(ALL);
            }}
          />
        ) : undefined
      }
    />
  );

  return (
    <SurfaceProvider surface="cream">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EpisodeList
          items={items}
          loading={list.isPending || held}
          loadingMore={list.isFetchingNextPage}
          header={header}
          empty={empty}
          onOpen={(item) => openPlayer(router, item.id)}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          bottomSpace={bottom}
        />
      </View>
    </SurfaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: themes.cream.bg },
  header: { gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.md },
  title: { color: themes.cream.textPrimary, ...nativeTextStyle('display') },
  bleed: { marginHorizontal: -layout.screenPadding },
});
