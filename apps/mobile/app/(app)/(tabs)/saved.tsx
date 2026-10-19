import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, nativeTextStyle, spacing } from '@ongod/tokens';
import { useSavedList } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { EpisodeList } from '../../../src/screens/EpisodeList';
import { useBottomSpace } from '../../../src/screens/layout';
import { openLibrary, openPlayer } from '../../../src/screens/navigation';
import { SavedEmpty } from '../../../src/screens/SavedEmpty';
import { AuroraBackground, Button, EmptyState, SurfaceProvider } from '../../../src/ui';

/** Хадгалсан (dark): the saved episodes, newest saved first (Saved.dc.html). */
export default function Saved() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const list = useSavedList();
  const [refreshing, setRefreshing] = useState(false);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);

  const refresh = async () => {
    setRefreshing(true);
    await list.refetch().catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <SurfaceProvider surface="dark">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <AuroraBackground variant="soft" />
        <EpisodeList
          items={items}
          loading={list.isPending}
          loadingMore={list.isFetchingNextPage}
          header={
            <Text style={styles.title} accessibilityRole="header">
              {mn.saved.title}
            </Text>
          }
          empty={
            list.isError ? (
              <EmptyState
                title={mn.episode.loadError}
                action={
                  <Button
                    label={mn.common.retry}
                    variant="secondary"
                    onPress={() => void list.refetch()}
                  />
                }
              />
            ) : (
              <SavedEmpty onBrowse={() => openLibrary(router)} />
            )
          }
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
  root: { flex: 1, backgroundColor: colors.bg },
  title: {
    color: colors.textPrimary,
    ...nativeTextStyle('display'),
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
});
