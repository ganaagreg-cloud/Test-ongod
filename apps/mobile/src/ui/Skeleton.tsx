import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  aspect,
  layout,
  motion,
  nativeTextStyle,
  radius,
  spacing,
  withAlpha,
  type ThemeColors,
} from '@ongod/tokens';
import { useAmbientActive } from './motion';
import { useSurface, useThemedStyles } from './surface';

/**
 * Loading placeholder (lists never show spinners): a gradient sweeps across it every 1.2 s, light
 * on dark and white on cream. Static with reduce-motion.
 */
export function Skeleton({
  shape = 'text',
  width,
  height,
}: {
  shape?: 'text' | 'thumb' | 'pill' | 'block';
  width?: DimensionValue;
  height?: DimensionValue;
}) {
  const { colors } = useSurface();
  const styles = useThemedStyles(makeStyles);
  const active = useAmbientActive();
  const [w, setW] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active || w === 0) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: motion.shimmerMs,
        easing: Easing.inOut(Easing.ease),
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
    );
    return () => cancelAnimation(progress);
  }, [active, w, progress]);

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-w, w]) }],
  }));

  return (
    <View
      aria-hidden
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        styles.base,
        styles[shape],
        width != null && { width },
        height != null && { height },
      ]}
    >
      {active ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <LinearGradient
            colors={[
              withAlpha(colors.skeleton, 0),
              colors.skeletonShine,
              withAlpha(colors.skeleton, 0),
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Placeholder with the same layout as <EpisodeRow> (4:3 thumbnail + three lines). */
export function EpisodeRowSkeleton() {
  return (
    <View style={rowStyles.row} aria-hidden>
      <Skeleton shape="thumb" width={layout.thumbWidth} />
      <View style={rowStyles.lines}>
        <Skeleton width="85%" />
        <Skeleton width="60%" />
        <Skeleton width="40%" />
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    base: { backgroundColor: c.skeleton, borderRadius: radius.small, overflow: 'hidden' },
    text: { height: nativeTextStyle('small').lineHeight },
    pill: { height: layout.chipHeight, borderRadius: radius.pill },
    thumb: { aspectRatio: aspect.thumbnail, borderRadius: radius.thumb },
    block: { borderRadius: radius.cardLarge },
  });

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  lines: { flex: 1, gap: spacing.xs },
});
