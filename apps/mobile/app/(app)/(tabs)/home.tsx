import { useCallback, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { formatDurationMn, type EpisodeItem } from '@ongod/shared';
import { colors, glass, layout, motion, nativeTextStyle, spacing } from '@ongod/tokens';
import { useAuth } from '../../../src/auth/AuthContext';
import { keys, useHome } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { durationBadge, greeting } from '../../../src/lib/episode';
import { ContinueCard } from '../../../src/screens/home/ContinueCard';
import { homeRows, type HomeRow } from '../../../src/screens/home/homeRows';
import { NextReleaseCard } from '../../../src/screens/home/NextReleaseCard';
import { useBottomSpace } from '../../../src/screens/layout';
import { openLibrary, openPlaylist, openPlayer } from '../../../src/screens/navigation';
import { SectionHeader } from '../../../src/screens/SectionHeader';
import {
  AuroraBackground,
  Button,
  CategoryCard,
  coverFamilyFor,
  EmptyState,
  Enter,
  EpisodeCard,
  Glass,
  HeroCarousel,
  Skeleton,
  SurfaceProvider,
  type HeroItem,
} from '../../../src/ui';

/** Hero slides: the newest episodes (DESIGN "Нүүр"). */
const HERO_COUNT = 3;

/** Нүүр (dark): greeting, then the rows of `homeRows` in order (Home.dc.html). */
export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const home = useHome();
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);

  // Back on this tab (e.g. after listening): fetch again if the data is old, once per focus.
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      // A fetch already running (the first visit) is left alone, not restarted.
      void queryClient.refetchQueries(
        { queryKey: keys.home, stale: true },
        { cancelRefetch: false },
      );
    }, [queryClient]),
  );

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // After 70 pt of scroll the greeting is gone: a glass bar with the title takes its place.
  const headerStyle = useAnimatedStyle(() => {
    const shown = scrollY.value > layout.headerCollapseAt ? 1 : 0;
    return {
      opacity: withTiming(shown, { duration: motion.durationMs }),
      transform: [
        { translateY: withTiming(shown ? 0 : -spacing.sm, { duration: motion.durationMs }) },
      ],
    };
  });

  const refresh = async () => {
    setRefreshing(true);
    await home.refetch().catch(() => undefined);
    setRefreshing(false);
  };

  const name = user ? user.firstName.trim() || user.username : '';
  const data = home.data;
  const open = (item: EpisodeItem, autoplay = false) => openPlayer(router, item.id, autoplay);
  // Phase 1 is members only: always logged in (the logged-out Нүүр comes later).
  const rows = data ? homeRows(data, true) : [];

  const cardRow = (
    row: { key: string; title: string; items: EpisodeItem[] },
    index: number,
    onAll: () => void,
  ) => (
    <Enter key={row.key} index={index} style={styles.sectionTight}>
      <View style={styles.padded}>
        <SectionHeader title={row.title} action={{ label: mn.home.all, onPress: onAll }} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cards}
      >
        {row.items.map((item) => (
          <EpisodeCard
            key={item.id}
            title={item.title}
            durationLabel={durationBadge(item) ?? ''}
            coverUri={item.coverUrl}
            family={coverFamilyFor(item.id)}
            width={layout.cardWidth}
            onPress={() => open(item)}
          />
        ))}
      </ScrollView>
    </Enter>
  );

  const renderRow = (row: HomeRow, index: number): ReactNode => {
    switch (row.kind) {
      case 'featured': {
        const hero: HeroItem[] = row.items.slice(0, HERO_COUNT).map((item) => ({
          id: item.id,
          title: item.title,
          tag: item.category.name,
          meta: item.durationSec ? formatDurationMn(item.durationSec) : item.category.name,
          imageUri: item.coverUrl,
          family: coverFamilyFor(item.id),
        }));
        const byId = new Map(row.items.map((item) => [item.id, item]));
        return (
          <Enter key={row.key} index={index}>
            <HeroCarousel
              items={hero}
              onOpen={(slide) => {
                const item = byId.get(slide.id);
                if (item) open(item);
              }}
              onPlay={(slide) => {
                const item = byId.get(slide.id);
                if (item) open(item, true);
              }}
              playLabel={mn.episode.play}
              slideLabel={mn.home.slide}
            />
          </Enter>
        );
      }
      case 'continue': {
        const resume = row.items[0];
        if (!resume) return null;
        return (
          <Enter key={row.key} index={index} style={styles.section}>
            <SectionHeader title={row.title} />
            <ContinueCard item={resume} onPress={() => open(resume, true)} />
          </Enter>
        );
      }
      case 'thisWeek':
        return (
          <Enter key={row.key} index={index} style={styles.section}>
            <SectionHeader title={row.title} />
            <NextReleaseCard release={row.release} />
          </Enter>
        );
      case 'playlist':
        return cardRow(row, index, () => openPlaylist(router, row.id));
      case 'latest':
        return cardRow(row, index, () => openLibrary(router));
      case 'categories':
        return (
          <Enter key={row.key} index={index} style={styles.section}>
            <SectionHeader
              title={row.title}
              action={{ label: mn.home.all, onPress: () => openLibrary(router) }}
            />
            <View style={styles.categoryList}>
              {row.categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  name={category.name}
                  countLabel={mn.home.episodeCount(category.episodeCount)}
                  imageUri={category.coverUrl}
                  family={coverFamilyFor(category.id)}
                  onPress={() => openLibrary(router, category.slug)}
                />
              ))}
            </View>
          </Enter>
        );
    }
  };

  let body: ReactNode;
  if (!data && home.isError) {
    body = (
      <EmptyState
        title={mn.episode.loadError}
        action={
          <Button label={mn.common.retry} variant="secondary" onPress={() => void home.refetch()} />
        }
      />
    );
  } else if (!data) {
    body = <HomeSkeleton />;
  } else if (rows.length === 0) {
    body = <EmptyState title={mn.home.emptyTitle} text={mn.home.emptyText} />;
  } else {
    body = <>{rows.map((row, index) => renderRow(row, index + 1))}</>;
  }

  return (
    <SurfaceProvider surface="dark">
      <View style={styles.root}>
        <AuroraBackground variant="soft" />
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xl, paddingBottom: bottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          <Enter index={0} style={styles.padded}>
            <Text style={styles.hello}>{greeting(new Date())}</Text>
            <Text style={styles.name} accessibilityRole="header" numberOfLines={1}>
              {name}
            </Text>
          </Enter>
          {body}
        </Animated.ScrollView>

        <Animated.View
          pointerEvents="none"
          style={[styles.header, { height: insets.top + layout.touchTarget }, headerStyle]}
        >
          <Glass tone="dark" opacity={glass.header} style={styles.headerGlass}>
            <Text style={styles.headerTitle}>{mn.home.title}</Text>
          </Glass>
        </Animated.View>
      </View>
    </SurfaceProvider>
  );
}

function HomeSkeleton() {
  return (
    <View style={[styles.padded, styles.section]} aria-hidden>
      <Skeleton shape="block" height={layout.cardWidth} />
      <Skeleton width="40%" />
      <Skeleton shape="block" height={layout.categoryCardHeight} />
      <Skeleton shape="block" height={layout.categoryCardHeight} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { gap: spacing.xxl },
  padded: { paddingHorizontal: layout.screenPadding },
  section: { paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  sectionTight: { gap: spacing.sm },
  cards: { paddingHorizontal: layout.screenPadding, gap: spacing.md },
  categoryList: { gap: spacing.sm },
  hello: { color: colors.textSecondary, ...nativeTextStyle('small') },
  name: { color: colors.textPrimary, ...nativeTextStyle('display') },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerGlass: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderColor: colors.hairline,
  },
  headerTitle: { color: colors.textPrimary, ...nativeTextStyle('body') },
});
