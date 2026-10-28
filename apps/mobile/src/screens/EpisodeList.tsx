import type { ReactElement } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type { EpisodeItem } from '@ongod/shared';
import { layout, spacing } from '@ongod/tokens';
import { useAuth } from '../auth/AuthContext';
import { useToggleSaved } from '../data/queries';
import { mn } from '../i18n/mn';
import { durationBadge, episodeMeta, isLocked, rowProgress } from '../lib/episode';
import { coverFamilyFor, EpisodeRow, EpisodeRowSkeleton, useSurface } from '../ui';

/** Skeleton rows while a list loads (no spinners on lists, DESIGN "Skeleton"). */
const SKELETON_ROWS = 5;

/**
 * A list of 4:3 episode rows with the bookmark, for Сан and Хадгалсан: loads more near the end,
 * pull to refresh, skeleton rows while loading, `empty` when there is nothing.
 */
export function EpisodeList({
  items,
  loading,
  loadingMore,
  header,
  empty,
  onOpen,
  onEndReached,
  refreshing,
  onRefresh,
  bottomSpace,
}: {
  items: readonly EpisodeItem[];
  loading: boolean;
  loadingMore: boolean;
  header: ReactElement;
  empty: ReactElement;
  onOpen: (item: EpisodeItem) => void;
  onEndReached: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  bottomSpace: number;
}) {
  const { colors } = useSurface();
  const toggleSaved = useToggleSaved();
  const { user } = useAuth();
  const now = new Date();
  return (
    <FlatList
      data={loading ? [] : items}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={header}
      ListEmptyComponent={
        loading ? (
          <View style={styles.skeletons}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <EpisodeRowSkeleton key={i} />
            ))}
          </View>
        ) : (
          empty
        )
      }
      ListFooterComponent={loadingMore ? <EpisodeRowSkeleton /> : undefined}
      contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
      onEndReachedThreshold={0.5}
      onEndReached={onEndReached}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.textSecondary}
          colors={[colors.primary]}
        />
      }
      renderItem={({ item, index }) => (
        <EpisodeRow
          index={index}
          title={item.title}
          meta={episodeMeta(item)}
          coverUri={item.thumbUrl ?? item.coverUrl}
          durationLabel={durationBadge(item)}
          family={coverFamilyFor(item.id)}
          locked={isLocked(item, user?.accessUntil, now)}
          progress={rowProgress(item)}
          save={{
            saved: item.saved,
            label: item.saved ? mn.episode.unsave : mn.episode.save,
            onToggle: () => toggleSaved.mutate({ id: item.id, saved: !item.saved }),
          }}
          onPress={() => onOpen(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenPadding, gap: spacing.xxs },
  skeletons: { gap: spacing.md, paddingTop: spacing.xs },
});
