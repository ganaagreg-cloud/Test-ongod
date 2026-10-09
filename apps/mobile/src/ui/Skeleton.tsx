import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';
import { colors, layout, motion, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { useReduceMotion } from './useReduceMotion';

/** Loading placeholder (lists never show spinners). A soft pulse; static with reduce-motion. */
export function Skeleton({
  shape = 'text',
  width,
}: {
  shape?: 'text' | 'cover' | 'pill';
  width?: DimensionValue;
}) {
  const reduceMotion = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: motion.durationMs * 4,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: motion.durationMs * 4,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  return (
    <Animated.View
      aria-hidden
      style={[styles.base, styles[shape], width != null && { width }, { opacity: pulse }]}
    />
  );
}

/** Placeholder with the same layout as <EpisodeRow>. */
export function EpisodeRowSkeleton() {
  return (
    <View style={styles.row} aria-hidden>
      <Skeleton shape="cover" width={layout.episodeRowCover} />
      <View style={styles.lines}>
        <Skeleton width="85%" />
        <Skeleton width="55%" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceRaised, borderRadius: radius.small },
  text: { height: nativeTextStyle('small').lineHeight },
  pill: { height: layout.chipHeight, borderRadius: radius.pill },
  cover: { aspectRatio: 1, borderRadius: layout.coverRadius },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  lines: { flex: 1, gap: spacing.xs },
});
