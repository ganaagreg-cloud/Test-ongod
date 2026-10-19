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
import { NextReleaseCard } from '../../../src/screens/home/NextReleaseCard';
import { useBottomSpace } from '../../../src/screens/layout';
import { openLibrary, openPlayer } from '../../../src/screens/navigation';
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

/** Нүүр (dark): greeting, hero, continue, new, categories, this week (Home.dc.html). */
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
  } else if (data.latest.length === 0) {
    body = <EmptyState title={mn.home.emptyTitle} text={mn.home.emptyText} />;
  } else {
    const hero: HeroItem[] = data.latest.slice(0, HERO_COUNT).map((item) => ({
      id: item.id,
      title: item.title,
      tag: item.category.name,
      meta: item.durationSec ? formatDurationMn(item.durationSec) : item.category.name,
      imageUri: item.coverUrl,
      family: coverFamilyFor(item.id),
    }));
    const byId = new Map(data.latest.map((item) => [item.id, item]));
    const resume = data.continueListening[0];
    body = (
      <>
        <Enter index={1}>
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

        {resume ? (
          <Enter index={2} style={styles.section}>
            <SectionHeader title={mn.home.continue} />
            <ContinueCard item={resume} onPress={() => open(resume, true)} />
          </Enter>
        ) : null}

        <Enter index={3} style={styles.sectionTight}>
          <View style={styles.padded}>
            <SectionHeader
              title={mn.home.latest}
              action={{ label: mn.home.all, onPress: () => openLibrary(router) }}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cards}
          >
            {data.latest.map((item) => (
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

        {data.categories.length > 0 ? (
          <Enter index={4} style={styles.section}>
            <SectionHeader
              title={mn.home.categories}
              action={{ label: mn.home.all, onPress: () => openLibrary(router) }}
            />
            <View style={styles.categoryList}>
              {data.categories.map((category) => (
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
        ) : null}

        {data.nextRelease ? (
          <Enter index={5} style={styles.section}>
            <SectionHeader title={mn.home.thisWeek} />
            <NextReleaseCard release={data.nextRelease} />
          </Enter>
        ) : null}
      </>
    );
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
