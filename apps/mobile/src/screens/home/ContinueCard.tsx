import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { EpisodeItem } from '@ongod/shared';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { mn } from '../../i18n/mn';
import { durationBadge, progressFraction, remainingLabel } from '../../lib/episode';
import {
  coverFamilyFor,
  EpisodeThumb,
  Icon,
  PressableScale,
  useSurface,
  useThemedStyles,
} from '../../ui';

/** Progress line grows in after the card appears (Home.dc.html `.grow`). */
const GROW_DELAY_MS = 500;
const GROW_MS = 1200;

/** "Үргэлжлүүлэх": the last half-heard episode, one tap resumes it. */
export function ContinueCard({ item, onPress }: { item: EpisodeItem; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const fraction = progressFraction(item) ?? 0;
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = withDelay(
      GROW_DELAY_MS,
      withTiming(fraction, { duration: GROW_MS, reduceMotion: ReduceMotion.System }),
    );
  }, [fraction, grow]);

  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  const remaining = remainingLabel(item);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${mn.home.continue}: ${item.title}`}
      onPress={onPress}
      style={styles.card}
    >
      <EpisodeThumb
        uri={item.thumbUrl ?? item.coverUrl}
        title={item.title}
        family={coverFamilyFor(item.id)}
        durationLabel={durationBadge(item)}
      />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {remaining ? `${item.category.name} · ${remaining}` : item.category.name}
        </Text>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fill]} />
        </View>
      </View>
      <View style={styles.play} aria-hidden>
        <Icon name="play" color={colors.accent} size="small" />
      </View>
    </PressableScale>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.sm,
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surfaceRaised,
    },
    body: { flex: 1, gap: spacing.xxs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    meta: { color: c.textSecondary, ...nativeTextStyle('caption') },
    track: {
      marginTop: spacing.xs,
      height: layout.progressBarHeight,
      borderRadius: radius.pill,
      backgroundColor: c.hairlineStrong,
      overflow: 'hidden',
    },
    fill: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.accent,
      transformOrigin: 'left',
    },
    play: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
