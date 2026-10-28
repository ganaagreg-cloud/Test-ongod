import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PlaylistPage, SeriesPage } from '@ongod/shared';
import { aspect, nativeTextStyle, radius, spacing, themes } from '@ongod/tokens';
import { mn } from '../i18n/mn';
import { Artwork, Button, coverFamilyFor, EmptyState, Skeleton, SurfaceProvider } from '../ui';
import { BackHeader } from './BackHeader';
import { EpisodeList } from './EpisodeList';
import { useBottomSpace } from './layout';
import { openPlayer } from './navigation';

/**
 * A series or a playlist page (cream, like Сан): back title row, cover, description and the
 * published episodes as 4:3 rows. A series row shows its "N-р хэсэг" in the meta line.
 */
export function CollectionScreen({
  query,
  emptyTitle,
  emptyText,
}: {
  query: UseQueryResult<SeriesPage | PlaylistPage>;
  emptyTitle: string;
  emptyText: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const [refreshing, setRefreshing] = useState(false);
  const page = query.data;

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark');
      return () => setStatusBarStyle('light');
    }, []),
  );

  const refresh = async () => {
    setRefreshing(true);
    await query.refetch().catch(() => undefined);
    setRefreshing(false);
  };

  const header = (
    <View style={styles.header}>
      <BackHeader title={page?.title ?? ''} />
      {page ? (
        <>
          <View style={styles.cover}>
            <Artwork
              uri={page.coverUrl}
              title={page.title}
              family={coverFamilyFor(page.id)}
              size="large"
            />
          </View>
          {page.description.trim() ? (
            <Text style={styles.description}>{page.description}</Text>
          ) : null}
        </>
      ) : query.isPending ? (
        <View style={styles.header} aria-hidden>
          <Skeleton shape="block" height={spacing.huge} />
          <Skeleton width="60%" />
        </View>
      ) : null}
    </View>
  );

  const empty = query.isError ? (
    <EmptyState
      title={mn.episode.loadError}
      action={
        <Button label={mn.common.retry} variant="secondary" onPress={() => void query.refetch()} />
      }
    />
  ) : (
    <EmptyState title={emptyTitle} text={emptyText} />
  );

  return (
    <SurfaceProvider surface="cream">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EpisodeList
          items={page?.items ?? []}
          loading={query.isPending}
          loadingMore={false}
          header={header}
          empty={empty}
          onOpen={(item) => openPlayer(router, item.id, false, page?.items ?? [])}
          onEndReached={() => undefined}
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
  cover: {
    width: '100%',
    aspectRatio: aspect.artwork,
    borderRadius: radius.hero,
    overflow: 'hidden',
    backgroundColor: themes.cream.brand,
  },
  description: { color: themes.cream.textSecondary, ...nativeTextStyle('body') },
});
